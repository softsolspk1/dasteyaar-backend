import express, { Response } from "express";
import {
  authenticateAdmin,
  requireSuperAdmin,
  AdminAuthRequest,
} from "../middleware/adminAuth";
import Prescription from "../models/Prescription";
import Patient from "../models/Patient";
import Doctor from "../models/Doctor";
import Order from "../models/Order";
import City from "../models/City";
import {
  createOrderFromPrescription,
  createOrderWithoutShopify,
} from "../services/orderService";
import { validate } from "../middleware/validate";
import Joi from "joi";
import logger from "../config/logger";

const router = express.Router();

const adminCreatePrescriptionSchema = Joi.object({
  patient_id: Joi.string().required(),
  doctor_id: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        product_id: Joi.string().required(),
        name: Joi.string().required(),
        sku: Joi.string().required(),
        price: Joi.number().required(),
        quantity: Joi.number().min(1).required(),
      }),
    )
    .min(1)
    .required(),
  prescription_text: Joi.string().optional().allow(""),
  duration_days: Joi.number().min(1).default(30),
  priority: Joi.string()
    .valid("normal", "urgent", "emergency")
    .default("normal"),
  diagnosis: Joi.string().optional().allow(""),
  notes: Joi.string().optional().allow(""),
  city_id: Joi.string().optional().allow(""),
  create_order: Joi.boolean().default(true),
});

// Admin Prescription Create Route
router.post(
  "/",
  authenticateAdmin,
  requireSuperAdmin,
  validate(adminCreatePrescriptionSchema),
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const {
        patient_id,
        doctor_id,
        items,
        prescription_text,
        duration_days,
        priority,
        diagnosis,
        notes,
        city_id,
        create_order,
      } = req.body;

      // 1. Fetch related entities
      const patient = await Patient.findById(patient_id);
      if (!patient) {
        res.status(404).json({ success: false, message: "Patient not found" });
        return;
      }

      const doctor = await Doctor.findById(doctor_id);
      if (!doctor) {
        res.status(404).json({ success: false, message: "Doctor not found" });
        return;
      }

      // Handle city
      let city = null;
      if (city_id) {
        city = await City.findById(city_id);
      } else if (patient.city) {
        city = await City.findOne({ name: patient.city, status: "active" });
      }

      // 2. Create Prescription
      const prescription = await Prescription.create({
        mrn: patient.mrn,
        patient_id,
        doctor_id,
        district_id: doctor.district_id,
        city_id: city?._id,
        prescription_text: prescription_text || "Manual entry by Admin",
        items,
        duration_days,
        priority,
        diagnosis,
        notes,
      });

      // 3. Optional Order Creation
      let order = null;
      if (create_order) {
        try {
          if (!city || city.distributor_channel === "pillbox") {
            ({ order } = await createOrderFromPrescription({
              prescription,
              patient,
              doctor,
              city,
            }));
          } else {
            ({ order } = await createOrderWithoutShopify({
              prescription,
              patient,
              doctor,
              city,
            }));
          }
        } catch (orderError) {
          logger.error("Failed to create order for admin prescription", {
            prescription_id: prescription._id,
            error: orderError,
          });
        }
      }

      res.status(201).json({
        success: true,
        data: {
          prescription,
          order,
        },
        message: order
          ? "Prescription and order created successfully"
          : "Prescription created successfully",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create prescription",
      });
    }
  },
);

export default router;
