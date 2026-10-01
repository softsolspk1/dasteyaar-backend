import express, { Response } from "express";
import District from "../models/District";
import Distributor from "../models/Distributor";
import {
  AdminAuthRequest,
  authenticateAdmin,
  requireSuperAdmin,
} from "../middleware/adminAuth";
import logger from "../config/logger";

const router = express.Router();

// Get all cities for a district (Super Admin only)
router.get(
  "/:districtId/cities",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const district = await District.findById(req.params.districtId).populate(
        "cities.distributor_id",
        "name email phone"
      );

      if (!district) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "District not found",
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          districtId: district._id,
          districtName: district.name,
          cities: (district as any).cities,
        },
      });
    } catch (error) {
      logger.error("Get district cities error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch cities",
        },
      });
    }
  }
);

// Add city to district (Super Admin only)
router.post(
  "/:districtId/cities",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { name, distributor_channel, distributor_id } = req.body;

      if (!name || !distributor_channel) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "City name and distributor_channel are required",
          },
        });
        return;
      }

      if (
        distributor_channel !== "pillbox" &&
        distributor_channel !== "local"
      ) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: 'distributor_channel must be either "pillbox" or "local"',
          },
        });
        return;
      }

      // If local channel, distributor_id is required
      if (distributor_channel === "local" && !distributor_id) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "distributor_id is required for local distributor channel",
          },
        });
        return;
      }

      // Verify distributor exists if provided
      if (distributor_id) {
        const distributor = await Distributor.findById(distributor_id);
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

        if (distributor.status !== "active") {
          res.status(400).json({
            success: false,
            error: {
              code: "DISTRIBUTOR_INACTIVE",
              message: "Cannot assign an inactive distributor",
            },
          });
          return;
        }
      }

      const district = await District.findById(req.params.districtId);
      if (!district) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "District not found",
          },
        });
        return;
      }

      // Check if city already exists in this district
      const cityExists = (district as any).cities.some(
        (city: any) => city.name.toLowerCase() === name.toLowerCase()
      );
      if (cityExists) {
        res.status(400).json({
          success: false,
          error: {
            code: "CITY_EXISTS",
            message: "City already exists in this district",
          },
        });
        return;
      }

      // Add city
      (district as any).cities.push({
        name: name.trim(),
        distributor_channel,
        distributor_id:
          distributor_channel === "local" ? distributor_id : undefined,
      });

      await district.save();

      logger.info("City added to district", {
        districtId: district._id,
        cityName: name,
        channel: distributor_channel,
        addedBy: req.user!.id,
      });

      res.status(201).json({
        success: true,
        data: (district as any).cities,
        message: "City added successfully",
      });
    } catch (error) {
      logger.error("Add city error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to add city",
        },
      });
    }
  }
);

// Update city in district (Super Admin only)
router.put(
  "/:districtId/cities/:cityId",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { name, distributor_channel, distributor_id } = req.body;

      const district = await District.findById(req.params.districtId);
      if (!district) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "District not found",
          },
        });
        return;
      }

      const city = ((district as any).cities as any).id(req.params.cityId);
      if (!city) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "City not found",
          },
        });
        return;
      }

      // Validate distributor_channel
      if (
        distributor_channel &&
        distributor_channel !== "pillbox" &&
        distributor_channel !== "local"
      ) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: 'distributor_channel must be either "pillbox" or "local"',
          },
        });
        return;
      }

      // Verify distributor if changing to local or updating distributor_id
      if (
        (distributor_channel === "local" ||
          city.distributor_channel === "local") &&
        distributor_id
      ) {
        const distributor = await Distributor.findById(distributor_id);
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

        if (distributor.status !== "active") {
          res.status(400).json({
            success: false,
            error: {
              code: "DISTRIBUTOR_INACTIVE",
              message: "Cannot assign an inactive distributor",
            },
          });
          return;
        }
      }

      // Update city fields
      if (name) city.name = name.trim();
      if (distributor_channel) {
        city.distributor_channel = distributor_channel;
        if (distributor_channel === "pillbox") {
          city.distributor_id = undefined;
        }
      }
      if (distributor_id !== undefined) {
        city.distributor_id = distributor_id || undefined;
      }

      await district.save();

      logger.info("City updated", {
        districtId: district._id,
        cityId: city._id,
        updatedBy: req.user!.id,
      });

      res.json({
        success: true,
        data: (district as any).cities,
        message: "City updated successfully",
      });
    } catch (error) {
      logger.error("Update city error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to update city",
        },
      });
    }
  }
);

// Delete city from district (Super Admin only)
router.delete(
  "/:districtId/cities/:cityId",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const district = await District.findById(req.params.districtId);
      if (!district) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "District not found",
          },
        });
        return;
      }

      const city = ((district as any).cities as any).id(req.params.cityId);
      if (!city) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "City not found",
          },
        });
        return;
      }

      // Remove city
      city.deleteOne();
      await district.save();

      logger.info("City deleted", {
        districtId: district._id,
        cityId: req.params.cityId,
        deletedBy: req.user!.id,
      });

      res.json({
        success: true,
        data: (district as any).cities,
        message: "City deleted successfully",
      });
    } catch (error) {
      logger.error("Delete city error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to delete city",
        },
      });
    }
  }
);

// Get all cities across all districts (for dropdown in doctor app)
router.get(
  "/all",
  authenticateAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const districts = await District.find({ status: "active" }).select(
        "name code cities"
      );

      const allCities = districts.flatMap((district) =>
        (district as any).cities.map((city: any) => ({
          cityName: city.name,
          districtId: district._id,
          districtName: district.name,
          districtCode: district.code,
          distributorChannel: city.distributor_channel,
          distributorId: city.distributor_id,
        }))
      );

      res.json({
        success: true,
        data: allCities,
      });
    } catch (error) {
      logger.error("Get all cities error:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch cities",
        },
      });
    }
  }
);


// Get all districts (Admin)
router.get('/', authenticateAdmin, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const query: any = {};
    if (status) query.status = status;

    const districts = await District.find(query).sort({ name: 1 });
    
    res.json({
      success: true,
      data: districts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch districts',
      },
    });
  }
});

export default router;
