import express, { Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Order";
import { authenticateAdmin, AdminAuthRequest } from "../middleware/adminAuth";
import { requireManagerOrAdmin } from "../middleware/role";
import logger from "../config/logger";

const router = express.Router();

const MIN_COMPLIANCE_SCORE = 3.5;

// OPM-05: Outlet/Distributor-level performance score rollup
router.get(
  "/",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const scores = await Order.aggregate([
        { $match: { "outlet_performance.rating_value": { $exists: true } } },
        {
          $group: {
            _id: "$distributor_info.distributor_id",
            distributor_name: { $first: "$distributor_info.name" },
            average_rating: { $avg: "$outlet_performance.rating_value" },
            avg_timeliness: { $avg: "$outlet_performance.rating_criteria.timeliness" },
            avg_product_condition: { $avg: "$outlet_performance.rating_criteria.product_condition" },
            avg_rider_behavior: { $avg: "$outlet_performance.rating_criteria.rider_behavior" },
            total_ratings: { $sum: 1 },
          },
        },
        { $sort: { average_rating: 1 } },
      ]);

      const withFlags = scores.map((s) => ({
        ...s,
        flagged: s.average_rating < MIN_COMPLIANCE_SCORE,
      }));

      res.json({ success: true, data: withFlags, meta: { min_compliance_score: MIN_COMPLIANCE_SCORE } });
    } catch (error: any) {
      logger.error("Outlet performance rollup error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to compute outlet performance" } });
    }
  }
);

// OPM-06: Outlets flagged below minimum compliance score
router.get(
  "/flagged",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const scores = await Order.aggregate([
        { $match: { "outlet_performance.rating_value": { $exists: true } } },
        {
          $group: {
            _id: "$distributor_info.distributor_id",
            distributor_name: { $first: "$distributor_info.name" },
            average_rating: { $avg: "$outlet_performance.rating_value" },
            total_ratings: { $sum: 1 },
          },
        },
        { $match: { average_rating: { $lt: MIN_COMPLIANCE_SCORE } } },
        { $sort: { average_rating: 1 } },
      ]);

      res.json({ success: true, data: scores });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch flagged outlets" } });
    }
  }
);

// OPM-07: Historical trend (weekly/monthly) per outlet
router.get(
  "/:distributorId/trend",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { granularity = "monthly" } = req.query;
      const dateFormat = granularity === "weekly" ? "%G-W%V" : "%Y-%m";

      const trend = await Order.aggregate([
        {
          $match: {
            "distributor_info.distributor_id": new mongoose.Types.ObjectId(req.params.distributorId),
            "outlet_performance.rating_value": { $exists: true },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: "$outlet_performance.rating_date" } },
            average_rating: { $avg: "$outlet_performance.rating_value" },
            total_ratings: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      res.json({ success: true, data: trend });
    } catch (error: any) {
      logger.error("Outlet trend error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch trend" } });
    }
  }
);

export default router;
