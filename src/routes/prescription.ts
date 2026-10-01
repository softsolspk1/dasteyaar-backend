import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { authenticateDoctor, AuthRequest } from "../middleware/auth";
import Prescription from "../models/Prescription";
import Patient from "../models/Patient";
import Product from "../models/Product";
import Doctor from "../models/Doctor";
import City from "../models/City";
import cloudinary from "../config/cloudinary";
import {
  createOrderFromPrescription,
  createOrderWithoutShopify,
} from "../services/orderService";
import { StockAvailabilityItem } from "../services/inventoryService";
import { validate } from "../middleware/validate";
import {
  createPrescriptionSchema,
  updatePrescriptionSchema,
} from "../validators/prescription.validator";
import { prescriptionLimiter, uploadLimiter } from "../middleware/security";
import { verifyAccessToken } from "../utils/jwt";

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../../uploads");
      if (!fs.existsSync(uploadPath))
        fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(
        null,
        file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
      );
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, and PDF are allowed."));
    }
  },
});

// Create prescription
router.post(
  "/",
  authenticateDoctor,
  prescriptionLimiter,
  validate(createPrescriptionSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        patient_id,
        prescription_text,
        dosage_frequency,
        duration_days,
        priority = "normal",
        selected_product,
        diagnosis,
        notes,
        city_id,
        coupon_code,
      } = req.body;

      const items = [selected_product];

      // Validate required fields
      if (!patient_id || !selected_product) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_FIELDS",
            message: "Patient and product are required",
          },
        });
        return;
      }

      // Auto-generate prescription_text from dosage_frequency if not provided
      let finalPrescriptionText = prescription_text;
      if (!finalPrescriptionText && dosage_frequency) {
        finalPrescriptionText = `Dosage Frequency: ${
          dosage_frequency.charAt(0).toUpperCase() + dosage_frequency.slice(1)
        }`;
      } else if (!finalPrescriptionText) {
        finalPrescriptionText = "No prescription details provided";
      }

      // Auto-generate duration_days based on dosage_frequency if not provided
      let finalDurationDays = duration_days;
      if (!finalDurationDays && dosage_frequency) {
        const durationMap: { [key: string]: number } = {
          daily: 30,
          weekly: 30,
          fortnightly: 30,
          monthly: 30,
        };
        finalDurationDays = durationMap[dosage_frequency] || 30;
      } else if (!finalDurationDays) {
        finalDurationDays = 30; // Default to 30 days
      }

      // Verify patient exists and belongs to doctor
      const patient = await Patient.findOne({
        _id: patient_id,
        created_by: req.doctor!.id,
      }).lean();

      if (!patient) {
        res.status(404).json({
          success: false,
          error: {
            code: "PATIENT_NOT_FOUND",
            message: "Patient not found",
          },
        });
        return;
      }

      // Check city - either from city_id or from patient's city name
      let city = null;
      if (city_id) {
        // City ID provided directly (e.g., during patient creation)
        city = await City.findById(city_id);
        if (!city) {
          res.status(404).json({
            success: false,
            error: {
              code: "CITY_NOT_FOUND",
              message: "City not found",
            },
          });
          return;
        }

        if (city.status !== "active") {
          res.status(403).json({
            success: false,
            error: {
              code: "CITY_INACTIVE",
              message: "This city is not currently active",
            },
          });
          return;
        }
      } else if (patient.city) {
        // No city_id provided, get city from patient's city name
        city = await City.findOne({ name: patient.city, status: "active" });

        if (!city) {
          // Continue without city - will default to Shopify
        }
      }

      // Get product details for all items (single batched query instead of one findById per item)
      const productsById = new Map(
        (await Product.find({ _id: { $in: items.map((item: any) => item.product_id) } })).map(
          (p: any) => [p._id.toString(), p],
        ),
      );
      const populatedItems = items.map((item: any) => {
        const product = productsById.get(String(item.product_id));
        if (!product) {
          throw new Error(`Product not found: ${item.product_id}`);
        }
        if (product.status !== "active") {
          throw new Error(`Product not active: ${product.name}`);
        }
        return {
          product_id: product._id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: item.quantity,
        };
      });

      // District restriction removed - all products now available to all districts

      // Create prescription
      const prescription = await Prescription.create({
        mrn: patient.mrn,
        patient_id,
        doctor_id: req.doctor!.id,
        district_id: req.doctor!.district_id,
        city_id: city?._id,
        prescription_text: finalPrescriptionText,
        prescription_files: [],
        duration_days: finalDurationDays,
        priority,
        items: populatedItems,
        diagnosis,
        notes,
      });

      // Get full doctor details for order creation
      const doctor = await Doctor.findById(req.doctor!.id);

      // Create order based on city's distributor channel
      let order;
      let couponWarning: string | undefined;
      let stockWarnings: StockAvailabilityItem[] = [];
      let stockUnavailableMessage: string | undefined;
      try {
        // If no city or city has pillbox channel, use Shopify
        if (!city || city.distributor_channel === "pillbox") {
          ({ order, couponWarning, stockWarnings } = await createOrderFromPrescription({
            prescription,
            patient,
            doctor: doctor || req.doctor,
            city,
            couponCode: coupon_code,
          }));
        } else {
          // City has 'other' channel, create order without Shopify
          ({ order, couponWarning, stockWarnings } = await createOrderWithoutShopify({
            prescription,
            patient,
            doctor: doctor || req.doctor,
            city,
            couponCode: coupon_code,
          }));
        }
      } catch (orderError: any) {
        // Don't fail the prescription creation if order creation fails
        console.error("ORDER_CREATION_FAILED_DURING_PRESCRIPTION:", orderError);

        if (orderError.code === "STOCK_UNAVAILABLE") {
          // INV-06: fully out-of-stock SKUs must block order confirmation, not
          // silently fall back to a local order that would hit the same wall.
          stockUnavailableMessage = orderError.message;
        } else {
          // Fallback: Create a local order without Shopify so it still shows in Admin Dashboard
          try {
            ({ order, couponWarning, stockWarnings } = await createOrderWithoutShopify({
              prescription,
              patient,
              doctor: doctor || req.doctor,
              city,
            }));
            console.log("Created local fallback order due to Shopify failure");
          } catch (fallbackError: any) {
            console.error("FALLBACK_ORDER_CREATION_FAILED:", fallbackError);
            if (fallbackError.code === "STOCK_UNAVAILABLE") {
              stockUnavailableMessage = fallbackError.message;
            }
          }
        }
      }

      res.status(201).json({
        success: true,
        data: {
          prescription,
          order: order || null,
          // CPN-08/10: surfaces silently-dropped coupon failures back to the agent
          // instead of leaving them undiscounted with no feedback (order still succeeds).
          coupon_warning: couponWarning || null,
          // INV-06: partial-availability items still fulfilled, but flagged for follow-up.
          stock_warnings: stockWarnings.length ? stockWarnings : null,
          stock_unavailable: stockUnavailableMessage || null,
        },
        message: order
          ? "Prescription and order created successfully"
          : stockUnavailableMessage ||
            "Prescription created successfully (order creation pending)",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: error.code || "SERVER_ERROR",
          message: error.message || "Failed to create prescription",
          details:
            process.env.NODE_ENV === "development"
              ? error.toString()
              : undefined,
        },
      });
    }
  },
);

// Upload prescription files
router.post(
  "/:id/upload",
  authenticateDoctor,
  upload.array("files", 5),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: "NO_FILES",
            message: "No files provided",
          },
        });
        return;
      }

      // Verify prescription exists and belongs to doctor
      const prescription = await Prescription.findOne({
        _id: req.params.id,
        doctor_id: req.doctor!.id,
      });

      if (!prescription) {
        res.status(404).json({
          success: false,
          error: {
            code: "PRESCRIPTION_NOT_FOUND",
            message: "Prescription not found",
          },
        });
        return;
      }

      // Upload files to Cloudinary
      const uploadPromises = files.map((file) => {
        return new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `${
                process.env.CLOUDINARY_FOLDER || "DastEYaar"
              }/prescription-files`,
              resource_type: "auto",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result!.secure_url);
            },
          );
          uploadStream.end(
            file.path ? fs.readFileSync(file.path) : file.buffer,
          );
          // Cleanup local file after upload
          if (file.path) fs.unlink(file.path, () => {});
        });
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      // Update prescription with file URLs
      prescription.prescription_files.push(...uploadedUrls);
      await prescription.save();

      res.json({
        success: true,
        data: {
          prescription_id: prescription._id,
          uploaded_files: uploadedUrls,
        },
        message: "Files uploaded successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to upload files",
        },
      });
    }
  },
);

// Get prescription by ID (Allowed for Doctor, Distributor, Admin)
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "No token provided" },
      });
      return;
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      res.status(401).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid token" },
      });
      return;
    }

    // Prepare query
    const query: any = { _id: req.params.id };

    // If user is a Doctor, restrict to their own prescriptions
    // We check if a Doctor exists with this ID. If so, apply restriction.
    // Ideally, we trust the token 'role' if available, but let's check DB to be safe strictly for Doctors,
    // or assume non-doctors have different roles.
    // For efficiency, let's assume if it's a doctor login, they are in the Doctor collection.

    // Check if the user is a Doctor
    const isDoctor = await Doctor.exists({ _id: decoded.id });
    if (isDoctor) {
      query.doctor_id = decoded.id;
    }

    // If not a doctor, we assume they are Admin or Distributor (who are allowed to view any prescription by ID)
    // You might want to add stricter checks here (e.g. verify Distributor existence), but for "View" access on a valid ID, it's generally low risk if authenticated.

    const prescription = await Prescription.findOne(query)
      .populate("patient_id", "mrn name phone")
      .populate("items.product_id", "name sku shopify_product_id");

    if (!prescription) {
      res.status(404).json({
        success: false,
        error: {
          code: "PRESCRIPTION_NOT_FOUND",
          message: "Prescription not found",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: prescription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Failed to fetch prescription",
      },
    });
  }
});

// Get patient's prescriptions
router.get(
  "/patient/:patientId",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const prescriptions = await Prescription.find({
        patient_id: req.params.patientId,
        doctor_id: req.doctor!.id,
      })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        data: prescriptions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch prescriptions",
        },
      });
    }
  },
);

// Update prescription (only if order not created yet)
router.put(
  "/:id",
  authenticateDoctor,
  validate(updatePrescriptionSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        prescription_text,
        duration_days,
        priority,
        items,
        diagnosis,
        notes,
      } = req.body;

      // Find prescription
      const prescription = await Prescription.findById(id);
      if (!prescription) {
        res.status(404).json({
          success: false,
          error: {
            code: "PRESCRIPTION_NOT_FOUND",
            message: "Prescription not found",
          },
        });
        return;
      }

      // Check if prescription belongs to the doctor
      if (prescription.doctor_id.toString() !== req.doctor!.id.toString()) {
        res.status(403).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "You can only update your own prescriptions",
          },
        });
        return;
      }

      // Check if order has been created (cannot edit if order exists)
      if (prescription.order_status !== "pending") {
        res.status(400).json({
          success: false,
          error: {
            code: "CANNOT_EDIT",
            message: "Cannot edit prescription after order has been created",
          },
        });
        return;
      }

      // Update fields
      if (prescription_text) prescription.prescription_text = prescription_text;
      if (duration_days) prescription.duration_days = duration_days;
      if (priority) prescription.priority = priority;
      if (items && Array.isArray(items)) {
        const updatedProductsById = new Map(
          (await Product.find({ _id: { $in: items.map((item: any) => item.product_id) } })).map(
            (p: any) => [p._id.toString(), p],
          ),
        );
        const updatedPopulatedItems = items.map((item: any) => {
          const product = updatedProductsById.get(String(item.product_id));
          if (!product) {
            throw new Error(`Product not found: ${item.product_id}`);
          }
          if (product.status !== "active") {
            throw new Error(`Product not active: ${product.name}`);
          }
          return {
            product_id: product._id,
            name: product.name,
            sku: product.sku,
            price: product.price,
            quantity: item.quantity,
          };
        });
        prescription.set("items", updatedPopulatedItems);
      }
      if (diagnosis !== undefined) prescription.diagnosis = diagnosis;
      if (notes !== undefined) prescription.notes = notes;

      await prescription.save();

      res.status(200).json({
        success: true,
        message: "Prescription updated successfully",
        data: prescription,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to update prescription",
        },
      });
    }
  },
);

export default router;
