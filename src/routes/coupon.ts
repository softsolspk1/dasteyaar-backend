import express, { Response } from "express";
import Coupon from "../models/Coupon";
import Doctor from "../models/Doctor";
import { authenticateDoctor, AuthRequest } from "../middleware/auth";
import { authenticateAdmin, AdminAuthRequest } from "../middleware/adminAuth";
import { requireDirector } from "../middleware/role";
import { generateCouponCode, validateCouponForOrder, computeDiscountAmount } from "../services/couponService";
import Notification from "../models/Notification";
import User from "../models/User";
import logger from "../config/logger";

const router = express.Router();

// CPN-01: Agent (Doctor-logged-in mobile account) creates a coupon request
router.post(
  "/request",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { doctor_id, discount_type, discount_value, validity_from, validity_to, usage_limit } = req.body;

      if (!doctor_id || !discount_value) {
        res.status(400).json({
          success: false,
          error: { code: "MISSING_FIELDS", message: "doctor_id and discount_value are required" },
        });
        return;
      }

      const doctor = await Doctor.findById(doctor_id);
      if (!doctor) {
        res.status(404).json({ success: false, error: { code: "DOCTOR_NOT_FOUND", message: "Doctor not found" } });
        return;
      }

      const requester = await Doctor.findById(req.doctor!.id);

      const type = discount_type === "percentage" ? "percentage" : "flat";
      const couponCode = await generateCouponCode(doctor.name, discount_value, type);

      const coupon = await Coupon.create({
        coupon_code: couponCode,
        doctor_id: doctor._id,
        doctor_name: doctor.name,
        discount_type: type,
        discount_value,
        requested_by: req.doctor!.id,
        requested_by_name: requester?.name || req.doctor!.email,
        status: "pending_approval",
        validity_from: validity_from ? new Date(validity_from) : undefined,
        validity_to: validity_to ? new Date(validity_to) : undefined,
        usage_limit: usage_limit ?? null,
        audit_log: [
          {
            action: "requested",
            by_id: req.doctor!.id,
            by_name: requester?.name,
            at: new Date(),
          },
        ],
      });

      // Notify Directors of the pending request
      const directors = await User.find({ role: { $in: ["director", "super_admin"] }, status: "active" }).lean();
      await Promise.all(
        directors.map((d) =>
          Notification.create({
            recipient_type: "user",
            recipient_id: d._id,
            title: "New Coupon Request",
            body: `${coupon.requested_by_name} requested coupon ${coupon.coupon_code} for Dr. ${coupon.doctor_name}`,
            type: "coupon_request",
            metadata: { coupon_id: coupon._id },
          })
        )
      );

      res.status(201).json({ success: true, data: coupon, message: "Coupon request submitted for approval" });
    } catch (error: any) {
      logger.error("Create coupon request error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to create coupon request" } });
    }
  }
);

// Agent's own coupon requests (with status/rejection reason visible - CPN-12)
router.get(
  "/my-requests",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const coupons = await Coupon.find({ requested_by: req.doctor!.id }).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: coupons });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch coupon requests" } });
    }
  }
);

// Active coupons usable for a given doctor (for agent to pick at order booking)
router.get(
  "/active",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { doctor_id } = req.query;
      const query: any = { status: "active" };
      if (doctor_id) query.doctor_id = doctor_id;

      const coupons = await Coupon.find(query).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: coupons });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch active coupons" } });
    }
  }
);

// Validate a coupon code against a doctor before applying (dry-run check)
router.post(
  "/validate",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { coupon_code, doctor_id, doctor_name, order_total, items } = req.body;
      if (!coupon_code || (!doctor_id && !doctor_name)) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "coupon_code and doctor_id or doctor_name are required" } });
        return;
      }

      const result = await validateCouponForOrder(coupon_code, doctor_id, doctor_name);
      if (!result.valid) {
        res.status(400).json({ success: false, error: { code: "COUPON_INVALID", message: result.reason } });
        return;
      }

      const discountAmount = order_total ? computeDiscountAmount(result.coupon!, order_total, items) : undefined;

      res.json({
        success: true,
        data: {
          coupon: result.coupon,
          discount_amount: discountAmount,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to validate coupon" } });
    }
  }
);

// --- Director/Admin approval workflow ---

// CPN-05: Pending approval queue
router.get(
  "/pending",
  authenticateAdmin,
  requireDirector,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const coupons = await Coupon.find({ status: "pending_approval" }).sort({ createdAt: 1 }).lean();
      res.json({ success: true, data: coupons });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch pending coupons" } });
    }
  }
);

// List all coupons (with filters) - reporting/audit view
router.get(
  "/",
  authenticateAdmin,
  requireDirector,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { status, doctor_id, requested_by } = req.query;
      const query: any = {};
      if (status) query.status = status;
      if (doctor_id) query.doctor_id = doctor_id;
      if (requested_by) query.requested_by = requested_by;

      const coupons = await Coupon.find(query).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: coupons });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch coupons" } });
    }
  }
);

// CPN-06/07: Approve (optionally modifying the discount value)
router.patch(
  "/:id/approve",
  authenticateAdmin,
  requireDirector,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { modified_discount_value, comment } = req.body;

      const coupon = await Coupon.findById(req.params.id);
      if (!coupon) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Coupon not found" } });
        return;
      }
      if (coupon.status !== "pending_approval") {
        res.status(400).json({ success: false, error: { code: "INVALID_STATE", message: "Coupon is not pending approval" } });
        return;
      }

      if (modified_discount_value !== undefined && modified_discount_value !== coupon.discount_value) {
        coupon.original_discount_value = coupon.discount_value;
        coupon.discount_value = modified_discount_value;
        coupon.audit_log.push({
          action: "modified",
          by_id: req.user!.id as any,
          by_name: req.user!.email,
          notes: `Discount changed from ${coupon.original_discount_value} to ${modified_discount_value}. ${comment || ""}`.trim(),
          at: new Date(),
        } as any);
      }

      coupon.status = "active";
      coupon.approved_by = req.user!.id as any;
      coupon.approved_by_name = req.user!.email;
      coupon.approval_date = new Date();
      coupon.audit_log.push({
        action: "approved",
        by_id: req.user!.id as any,
        by_name: req.user!.email,
        notes: comment,
        at: new Date(),
      } as any);

      await coupon.save();

      await Notification.create({
        recipient_type: "doctor",
        recipient_id: coupon.requested_by,
        title: "Coupon Approved",
        body: `Your coupon ${coupon.coupon_code} for Dr. ${coupon.doctor_name} has been approved.`,
        type: "coupon_status",
        metadata: { coupon_id: coupon._id },
      });

      res.json({ success: true, data: coupon, message: "Coupon approved" });
    } catch (error: any) {
      logger.error("Approve coupon error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to approve coupon" } });
    }
  }
);

// CPN-06: Reject with reason
router.patch(
  "/:id/reject",
  authenticateAdmin,
  requireDirector,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { reason } = req.body;
      if (!reason) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "Rejection reason is required" } });
        return;
      }

      const coupon = await Coupon.findById(req.params.id);
      if (!coupon) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Coupon not found" } });
        return;
      }
      if (coupon.status !== "pending_approval") {
        res.status(400).json({ success: false, error: { code: "INVALID_STATE", message: "Coupon is not pending approval" } });
        return;
      }

      coupon.status = "rejected";
      coupon.rejection_reason = reason;
      coupon.approved_by = req.user!.id as any;
      coupon.approved_by_name = req.user!.email;
      coupon.approval_date = new Date();
      coupon.audit_log.push({
        action: "rejected",
        by_id: req.user!.id as any,
        by_name: req.user!.email,
        notes: reason,
        at: new Date(),
      } as any);

      await coupon.save();

      await Notification.create({
        recipient_type: "doctor",
        recipient_id: coupon.requested_by,
        title: "Coupon Rejected",
        body: `Your coupon request ${coupon.coupon_code} was rejected: ${reason}`,
        type: "coupon_status",
        metadata: { coupon_id: coupon._id },
      });

      res.json({ success: true, data: coupon, message: "Coupon rejected" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to reject coupon" } });
    }
  }
);

// Reporting: coupon-wise / doctor-wise / agent-wise discount totals (CPN-11)
router.get(
  "/reports/discounts",
  authenticateAdmin,
  requireDirector,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const Order = (await import("../models/Order")).default;

      const [byCoupon, byDoctor, byAgent] = await Promise.all([
        Order.aggregate([
          { $match: { "discount.coupon_id": { $ne: null } } },
          {
            $group: {
              _id: { coupon_id: "$discount.coupon_id", coupon_code: "$discount.coupon_code" },
              total_discount: { $sum: "$discount.discount_amount" },
              order_count: { $sum: 1 },
            },
          },
        ]),
        Order.aggregate([
          { $match: { "discount.coupon_id": { $ne: null } } },
          {
            $group: {
              _id: { doctor_id: "$doctor_info.doctor_id", doctor_name: "$doctor_info.name" },
              total_discount: { $sum: "$discount.discount_amount" },
              order_count: { $sum: 1 },
            },
          },
        ]),
        Coupon.aggregate([
          { $match: { usage_count: { $gt: 0 } } },
          {
            $group: {
              _id: { agent_id: "$requested_by", agent_name: "$requested_by_name" },
              coupons_used: { $sum: 1 },
              total_usage_count: { $sum: "$usage_count" },
            },
          },
        ]),
      ]);

      res.json({ success: true, data: { byCoupon, byDoctor, byAgent } });
    } catch (error: any) {
      logger.error("Coupon discount report error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build report" } });
    }
  }
);

export default router;
