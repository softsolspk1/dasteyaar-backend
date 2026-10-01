import express, { Response } from "express";
import bcrypt from "bcryptjs";
import Distributor from "../models/Distributor";
import District from "../models/District";
import {
  AdminAuthRequest,
  authenticateAdmin,
  requireSuperAdmin,
} from "../middleware/adminAuth";
import logger from "../config/logger";

const router = express.Router();

// Get all distributors (Super Admin only)
router.get(
  "/",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { status, search, page = 1, limit = 50 } = req.query;

      const query: any = {};

      // Filter by status
      if (status && (status === "active" || status === "inactive")) {
        query.status = status;
      }

      // Search by name, email, or phone
      if (search && typeof search === "string") {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const [distributors, total] = await Promise.all([
        Distributor.find(query)
          .select("-password")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        Distributor.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          distributors,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      logger.error("Get distributors error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch distributors",
        },
      });
    }
  }
);

// Get distributor by ID (Super Admin only)
router.get(
  "/:id",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const distributor = await Distributor.findById(req.params.id).select(
        "-password"
      );

      if (!distributor) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Distributor not found",
          },
        });
        return;
      }

      // Get assigned cities
      const districts = await District.find({
        "cities.distributor_id": distributor._id,
      }).select("name code cities");

      const assignedCities = districts.flatMap((district) =>
        (district as any).cities
          .filter(
            (city: any) =>
              city.distributor_id?.toString() === distributor._id.toString()
          )
          .map((city: any) => ({
            cityName: city.name,
            districtName: district.name,
            districtCode: district.code,
          }))
      );

      res.json({
        success: true,
        data: {
          ...distributor.toObject(),
          assignedCities,
        },
      });
    } catch (error) {
      logger.error("Get distributor error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch distributor",
        },
      });
    }
  }
);

// Create distributor (Super Admin only)
router.post(
  "/",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { email, password, name, phone } = req.body;

      // Validate required fields
      if (!email || !password || !name || !phone) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Email, password, name, and phone are required",
          },
        });
        return;
      }

      // Check if distributor already exists
      const existingDistributor = await Distributor.findOne({
        email: email.toLowerCase(),
      });
      if (existingDistributor) {
        res.status(400).json({
          success: false,
          error: {
            code: "DISTRIBUTOR_EXISTS",
            message: "A distributor with this email already exists",
          },
        });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create distributor
      const distributor = await Distributor.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        phone,
        status: "active",
      });

      logger.info("Distributor created", {
        distributorId: distributor._id,
        email: distributor.email,
        createdBy: req.user!.id,
      });

      const distributorObj = distributor.toObject();
      delete distributorObj.password;

      res.status(201).json({
        success: true,
        data: distributorObj,
        message: "Distributor created successfully",
      });
    } catch (error) {
      logger.error("Create distributor error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to create distributor",
        },
      });
    }
  }
);

// Update distributor (Super Admin only)
router.put(
  "/:id",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { name, phone, email, password } = req.body;

      const distributor = await Distributor.findById(req.params.id);
      if (!distributor) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Distributor not found",
          },
        });
        return;
      }

      // Update fields
      if (name) distributor.name = name;
      if (phone) distributor.phone = phone;
      if (email) distributor.email = email.toLowerCase();
      if (password) {
        distributor.password = await bcrypt.hash(password, 10);
      }

      await distributor.save();

      logger.info("Distributor updated", {
        distributorId: distributor._id,
        updatedBy: req.user!.id,
      });

      const distributorObj = distributor.toObject();
      delete distributorObj.password;

      res.json({
        success: true,
        data: distributorObj,
        message: "Distributor updated successfully",
      });
    } catch (error) {
      logger.error("Update distributor error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to update distributor",
        },
      });
    }
  }
);

// Update distributor status (Super Admin only)
router.patch(
  "/:id/status",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { status } = req.body;

      if (!status || (status !== "active" && status !== "inactive")) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Valid status (active or inactive) is required",
          },
        });
        return;
      }

      const distributor = await Distributor.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select("-password");

      if (!distributor) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Distributor not found",
          },
        });
        return;
      }

      logger.info("Distributor status updated", {
        distributorId: distributor._id,
        newStatus: status,
        updatedBy: req.user!.id,
      });

      res.json({
        success: true,
        data: distributor,
        message: `Distributor ${
          status === "active" ? "activated" : "deactivated"
        } successfully`,
      });
    } catch (error) {
      logger.error("Update distributor status error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to update distributor status",
        },
      });
    }
  }
);

// Delete distributor (Super Admin only)
router.delete(
  "/:id",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const distributor = await Distributor.findById(req.params.id);

      if (!distributor) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Distributor not found",
          },
        });
        return;
      }

      // Check if distributor is assigned to any cities
      const assignedDistricts = await District.findOne({
        "cities.distributor_id": distributor._id,
      });

      if (assignedDistricts) {
        res.status(400).json({
          success: false,
          error: {
            code: "DISTRIBUTOR_IN_USE",
            message:
              "Cannot delete distributor. They are assigned to one or more cities.",
          },
        });
        return;
      }

      await distributor.deleteOne();

      logger.info("Distributor deleted", {
        distributorId: distributor._id,
        deletedBy: req.user!.id,
      });

      res.json({
        success: true,
        message: "Distributor deleted successfully",
      });
    } catch (error) {
      logger.error("Delete distributor error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to delete distributor",
        },
      });
    }
  }
);

export default router;
