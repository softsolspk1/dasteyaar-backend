import express, { Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Order from "../models/Order";
import Rider from "../models/Rider";
import cloudinary from "../config/cloudinary";
import { authenticateAny, AnyAuthRequest, isInternalRole } from "../middleware/anyAuth";
import greenApiService from "../services/greenApiService";
import { calculateEDT, autoAssignRider } from "../services/deliveryService";
import logger from "../config/logger";

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../../uploads");
      if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // RX-02: 5MB default max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only JPEG, PNG, and PDF are allowed."));
  },
});

function orderQuickTags() {
  return ["Customer not reachable", "Delayed delivery requested", "Payment pending", "Address confirmed", "Rescheduled by patient"];
}

// ============ RMK: Add Remarks (Every Order) ============

router.get("/quick-tags", authenticateAny, (req, res) => {
  res.json({ success: true, data: orderQuickTags() });
});

// RMK-01/02/03: Append a timestamped remark (never overwrite)
router.post(
  "/:id/remarks",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      const { text, visibility } = req.body;
      if (!text) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "Remark text is required" } });
        return;
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }

      order.remarks.push({
        text,
        added_by_id: req.actor!.id as any,
        added_by_role: req.actor!.role,
        added_by_name: req.actor!.name,
        visibility: visibility === "internal" && isInternalRole(req.actor!.role) ? "internal" : "public",
        createdAt: new Date(),
      } as any);

      await order.save();

      res.status(201).json({ success: true, data: order.remarks, message: "Remark added" });
    } catch (error: any) {
      logger.error("Add remark error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to add remark" } });
    }
  }
);

// RMK-04: Fetch remarks, filtering internal-only entries for non-internal roles
router.get(
  "/:id/remarks",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      const order = await Order.findById(req.params.id).select("remarks").lean();
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }

      const canSeeInternal = isInternalRole(req.actor!.role) || req.actor!.role === "distributor";
      const remarks = canSeeInternal ? order.remarks : order.remarks.filter((r: any) => r.visibility !== "internal");

      res.json({ success: true, data: remarks });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch remarks" } });
    }
  }
);

// ============ RX: Order-level Prescription Attachment ============

// RX-01/02/03: Upload one or more prescription images/PDFs directly to the order
router.post(
  "/:id/prescription-attachments",
  authenticateAny,
  upload.array("files", 5),
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: { code: "NO_FILES", message: "No files provided" } });
        return;
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }

      const uploadPromises = files.map((file) => {
        return new Promise<{ url: string; file_type: string }>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `${process.env.CLOUDINARY_FOLDER || "DastEYaar"}/order-prescriptions`,
              resource_type: "auto",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve({ url: result!.secure_url, file_type: file.mimetype });
            }
          );
          uploadStream.end(file.path ? fs.readFileSync(file.path) : file.buffer);
          if (file.path) fs.unlink(file.path, () => {});
        });
      });

      const uploaded = await Promise.all(uploadPromises);

      for (const u of uploaded) {
        order.prescription_attachments.push({
          url: u.url,
          file_type: u.file_type,
          uploaded_by_id: req.actor!.id as any,
          uploaded_by_role: req.actor!.role,
          uploaded_by_name: req.actor!.name,
          uploaded_at: new Date(),
        } as any);
      }

      order.prescription_status = "attached";
      await order.save();

      res.json({ success: true, data: order.prescription_attachments, message: "Prescription attached to order" });
    } catch (error: any) {
      logger.error("Order prescription upload error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to upload files" } });
    }
  }
);

// RX-04: View attachments (Distributor/Manager/Admin/Doctor)
router.get(
  "/:id/prescription-attachments",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      const order = await Order.findById(req.params.id).select("prescription_attachments prescription_status prescription_required").lean();
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }
      res.json({
        success: true,
        data: {
          attachments: order.prescription_attachments,
          status: order.prescription_status,
          required: order.prescription_required,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch attachments" } });
    }
  }
);

// RX-05: Toggle whether a prescription is mandatory for this order
router.patch(
  "/:id/prescription-required",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      if (!isInternalRole(req.actor!.role)) {
        res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only internal staff can configure this" } });
        return;
      }
      const { required } = req.body;
      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }
      order.prescription_required = !!required;
      if (order.prescription_required && order.prescription_attachments.length === 0) {
        order.prescription_status = "pending";
      } else if (!order.prescription_required && order.prescription_attachments.length === 0) {
        order.prescription_status = "not_required";
      }
      await order.save();
      res.json({ success: true, data: order, message: "Updated" });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to update" } });
    }
  }
);

// ============ DEL: Delivery Details ============

// DEL-01/02/03/04: Schedule delivery + assign rider
router.put(
  "/:id/delivery",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      if (!isInternalRole(req.actor!.role) && req.actor!.role !== "distributor") {
        res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only distributor/manager/admin can schedule delivery" } });
        return;
      }

      const {
        scheduled_date,
        scheduled_time_slot,
        estimated_delivery_time,
        rider_id,
        rider_name,
        rider_contact,
        rider_vehicle,
        assignment_type,
      } = req.body;

      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }

      const wasScheduled = order.delivery?.delivery_status && order.delivery.delivery_status !== "not_scheduled";
      const distributorId = order.distributor_info?.distributor_id ? String(order.distributor_info.distributor_id) : undefined;
      const finalAssignmentType = assignment_type ?? order.delivery?.assignment_type ?? "manual";

      // DEL-04: resolve rider fields. "auto" ignores any manually-typed
      // rider_name/contact and picks the least-busy active rider for this
      // order's distributor; an explicit rider_id (from the riders dropdown)
      // is honored as a manual pick; otherwise free-text fields fall through.
      let riderFields: {
        rider_id?: any;
        rider_name?: string;
        rider_contact?: string;
        rider_vehicle?: string;
      } = {
        rider_id: order.delivery?.rider_id,
        rider_name: rider_name ?? order.delivery?.rider_name,
        rider_contact: rider_contact ?? order.delivery?.rider_contact,
        rider_vehicle: rider_vehicle ?? order.delivery?.rider_vehicle,
      };

      if (finalAssignmentType === "auto") {
        if (!distributorId) {
          res.status(400).json({ success: false, error: { code: "NO_DISTRIBUTOR", message: "Order has no distributor assigned; cannot auto-assign a rider." } });
          return;
        }
        const rider = await autoAssignRider(distributorId);
        if (!rider) {
          res.status(400).json({ success: false, error: { code: "NO_ACTIVE_RIDERS", message: "No active riders configured for this distributor. Add a rider first or assign manually." } });
          return;
        }
        riderFields = {
          rider_id: (rider as any)._id,
          rider_name: (rider as any).name,
          rider_contact: (rider as any).contact,
          rider_vehicle: (rider as any).vehicle_info,
        };
      } else if (rider_id) {
        const rider = await Rider.findById(rider_id).lean();
        if (rider) {
          riderFields = {
            rider_id: (rider as any)._id,
            rider_name: (rider as any).name,
            rider_contact: (rider as any).contact,
            rider_vehicle: (rider as any).vehicle_info,
          };
        }
      }

      // DEL-02: only auto-compute EDT the first time it's missing — an
      // explicit value always wins, and we don't silently drift an
      // already-set EDT on later unrelated edits (e.g. rider changes).
      let resolvedEDT = order.delivery?.estimated_delivery_time;
      if (estimated_delivery_time) {
        resolvedEDT = new Date(estimated_delivery_time);
      } else if (!resolvedEDT && distributorId) {
        resolvedEDT = await calculateEDT(distributorId, order.patient_info?.city_id ? String(order.patient_info.city_id) : null);
      }

      order.delivery = {
        ...(order.delivery || ({} as any)),
        scheduled_date: scheduled_date ? new Date(scheduled_date) : order.delivery?.scheduled_date,
        scheduled_time_slot: scheduled_time_slot ?? order.delivery?.scheduled_time_slot,
        estimated_delivery_time: resolvedEDT,
        ...riderFields,
        assignment_type: finalAssignmentType,
        delivery_status: order.delivery?.delivery_status === "not_scheduled" || !order.delivery?.delivery_status ? "scheduled" : order.delivery.delivery_status,
        actual_delivery_time: order.delivery?.actual_delivery_time,
      };

      await order.save();

      // DEL-06 + OPM-01: notify patient once, on first scheduling
      if (!wasScheduled && order.patient_info?.phone) {
        const dateStr = order.delivery.scheduled_date ? new Date(order.delivery.scheduled_date).toDateString() : "soon";
        const riderLine = order.delivery.rider_name ? `\nRider: ${order.delivery.rider_name} (${order.delivery.rider_contact || "N/A"})` : "";
        const message = `Dear ${order.patient_info.name}, your order ${order.shopify_order_number || ""} is scheduled for delivery on ${dateStr}${order.delivery.scheduled_time_slot ? ` (${order.delivery.scheduled_time_slot})` : ""}.${riderLine}\n\n*Team Dast e Yaar*`;
        greenApiService.sendMessage(order.patient_info.phone, message).catch(() => {});

        order.outlet_performance = {
          ...(order.outlet_performance || ({} as any)),
          before_message_status: "sent",
        };
        await order.save();
      }

      res.json({ success: true, data: order, message: "Delivery details updated" });
    } catch (error: any) {
      logger.error("Update delivery error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to update delivery details" } });
    }
  }
);

// DEL-05/07: Update delivery status pipeline
router.patch(
  "/:id/delivery/status",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      if (!isInternalRole(req.actor!.role) && req.actor!.role !== "distributor") {
        res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Only distributor/manager/admin can update delivery status" } });
        return;
      }

      const { delivery_status } = req.body;
      const validStatuses = ["not_scheduled", "scheduled", "out_for_delivery", "delivered", "failed", "rescheduled"];
      if (!validStatuses.includes(delivery_status)) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid delivery status" } });
        return;
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
        return;
      }

      // DEL-05: enforce the delivery status state machine — Scheduled -> Out
      // for Delivery -> Delivered / Failed / Rescheduled. Delivered is terminal.
      const currentStatus = order.delivery?.delivery_status || "not_scheduled";
      const allowedTransitions: Record<string, string[]> = {
        not_scheduled: ["scheduled"],
        scheduled: ["out_for_delivery", "rescheduled", "failed"],
        out_for_delivery: ["delivered", "failed", "rescheduled"],
        rescheduled: ["scheduled", "out_for_delivery"],
        failed: ["rescheduled", "scheduled"],
        delivered: [],
      };

      if (currentStatus !== delivery_status && !allowedTransitions[currentStatus]?.includes(delivery_status)) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_STATUS_TRANSITION",
            message: `Cannot change delivery status from '${currentStatus}' to '${delivery_status}'`,
          },
        });
        return;
      }

      order.delivery = { ...(order.delivery || ({} as any)), delivery_status };

      if (delivery_status === "delivered") {
        order.delivery.actual_delivery_time = new Date();
      }

      await order.save();

      // OPM-02: auto after-delivery message + rating link when marked Delivered
      if (delivery_status === "delivered" && order.patient_info?.phone && order.outlet_performance?.after_message_status !== "sent") {
        const ratingUrl = `${process.env.PATIENT_RATING_BASE_URL || "https://dasteyaar.pk/rate"}/${order._id}`;
        const message = `Dear ${order.patient_info.name}, your order has been delivered! We'd love your feedback.\nPlease rate your experience: ${ratingUrl}\n\n*Team Dast e Yaar*`;
        greenApiService.sendMessage(order.patient_info.phone, message).catch(() => {});

        order.outlet_performance = {
          ...(order.outlet_performance || ({} as any)),
          after_message_status: "sent",
        };
        await order.save();
      }

      res.json({ success: true, data: order, message: "Delivery status updated" });
    } catch (error: any) {
      logger.error("Update delivery status error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to update delivery status" } });
    }
  }
);

// DEL-08: Delivery calendar/list view
router.get(
  "/delivery/calendar",
  authenticateAny,
  async (req: AnyAuthRequest, res: Response): Promise<void> => {
    try {
      const { date, distributor_id, rider_name } = req.query;
      const query: any = { "delivery.scheduled_date": { $exists: true } };

      if (date) {
        const start = new Date(date as string);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        query["delivery.scheduled_date"] = { $gte: start, $lte: end };
      }
      if (distributor_id) query["distributor_info.distributor_id"] = distributor_id;
      if (rider_name) query["delivery.rider_name"] = rider_name;

      const orders = await Order.find(query)
        .select("shopify_order_number patient_info doctor_info delivery total_amount order_status distributor_info")
        .sort({ "delivery.scheduled_date": 1 })
        .lean();

      res.json({ success: true, data: orders });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch delivery calendar" } });
    }
  }
);

export default router;
