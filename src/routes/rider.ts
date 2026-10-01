import express, { Response } from "express";
import Rider from "../models/Rider";
import { authenticateAny, AnyAuthRequest, isInternalRole } from "../middleware/anyAuth";
import logger from "../config/logger";

const router = express.Router();

function canManage(actor: { role: string; id: string }, targetDistributorId: string): boolean {
  if (isInternalRole(actor.role)) return true;
  if (actor.role === "distributor") return String(actor.id) === String(targetDistributorId);
  return false;
}

// List riders for a distributor (distributor sees own; internal roles can pass distributor_id)
router.get("/", authenticateAny, async (req: AnyAuthRequest, res: Response): Promise<void> => {
  try {
    const actor = req.actor!;
    let distributorId = req.query.distributor_id as string | undefined;

    if (actor.role === "distributor") {
      distributorId = actor.id;
    } else if (!isInternalRole(actor.role)) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized to view riders" } });
      return;
    }

    const query: any = {};
    if (distributorId) query.distributor_id = distributorId;
    if (req.query.status) query.status = req.query.status;

    const riders = await Rider.find(query).populate("distributor_id", "name city_id").sort({ status: 1, name: 1 }).lean();
    res.json({ success: true, data: riders });
  } catch (error: any) {
    logger.error("List riders error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch riders" } });
  }
});

router.post("/", authenticateAny, async (req: AnyAuthRequest, res: Response): Promise<void> => {
  try {
    const actor = req.actor!;
    const { name, contact, vehicle_info } = req.body;
    const distributor_id = actor.role === "distributor" ? actor.id : req.body.distributor_id;

    if (!distributor_id || !name || !contact) {
      res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "distributor_id, name and contact are required" } });
      return;
    }
    if (!canManage(actor, distributor_id)) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized to add riders for this distributor" } });
      return;
    }

    const rider = await Rider.create({ distributor_id, name, contact, vehicle_info, status: "active" });
    res.status(201).json({ success: true, data: rider, message: "Rider added" });
  } catch (error: any) {
    logger.error("Create rider error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to add rider" } });
  }
});

router.put("/:id", authenticateAny, async (req: AnyAuthRequest, res: Response): Promise<void> => {
  try {
    const actor = req.actor!;
    const rider = await Rider.findById(req.params.id);
    if (!rider) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Rider not found" } });
      return;
    }
    if (!canManage(actor, String(rider.distributor_id))) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized to update this rider" } });
      return;
    }

    const { name, contact, vehicle_info, status } = req.body;
    if (name !== undefined) rider.name = name;
    if (contact !== undefined) rider.contact = contact;
    if (vehicle_info !== undefined) rider.vehicle_info = vehicle_info;
    if (status !== undefined && ["active", "inactive"].includes(status)) rider.status = status;

    await rider.save();
    res.json({ success: true, data: rider, message: "Rider updated" });
  } catch (error: any) {
    logger.error("Update rider error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to update rider" } });
  }
});

router.delete("/:id", authenticateAny, async (req: AnyAuthRequest, res: Response): Promise<void> => {
  try {
    const actor = req.actor!;
    const rider = await Rider.findById(req.params.id);
    if (!rider) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Rider not found" } });
      return;
    }
    if (!canManage(actor, String(rider.distributor_id))) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Not authorized to remove this rider" } });
      return;
    }

    // Soft-delete: past orders keep a denormalized rider_name/contact
    // snapshot, so deactivating (not hard-deleting) preserves that history
    // while removing the rider from future auto-assignment.
    rider.status = "inactive";
    await rider.save();
    res.json({ success: true, data: rider, message: "Rider deactivated" });
  } catch (error: any) {
    logger.error("Delete rider error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to remove rider" } });
  }
});

export default router;
