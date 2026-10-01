import express, { Response } from "express";
import mongoose from "mongoose";
import Inventory from "../models/Inventory";
import Product from "../models/Product";
import Distributor from "../models/Distributor";
import City from "../models/City";
import Order from "../models/Order";
import { authenticateAdmin, AdminAuthRequest } from "../middleware/adminAuth";
import { requireManagerOrAdmin } from "../middleware/role";
import { authenticateDistributor, DistributorAuthRequest } from "../middleware/distributorAuth";
import logger from "../config/logger";

const AVG_SALES_WINDOW_MONTHS = 6;

/**
 * Attaches, per inventory record: the city name(s) the record's distributor serves
 * (an outlet can be linked from more than one City.distributor_ids, e.g. Pillbox
 * serving both Lahore and Karachi) and average monthly sales quantity over the last
 * AVG_SALES_WINDOW_MONTHS, computed from delivered order line items for that
 * distributor+SKU.
 */
async function attachOutletCitiesAndAvgSales(inventory: any[]): Promise<any[]> {
  const distributorIds = Array.from(
    new Set(inventory.map((i) => i.distributor_id?._id?.toString()).filter(Boolean))
  );
  if (distributorIds.length === 0) return inventory;

  const cities = await City.find({ distributor_ids: { $in: distributorIds } })
    .select("name distributor_ids")
    .lean();
  const citiesByDistributor = new Map<string, string[]>();
  for (const city of cities) {
    for (const distId of city.distributor_ids || []) {
      const key = distId.toString();
      if (!citiesByDistributor.has(key)) citiesByDistributor.set(key, []);
      citiesByDistributor.get(key)!.push(city.name);
    }
  }

  const since = new Date();
  since.setMonth(since.getMonth() - AVG_SALES_WINDOW_MONTHS);
  const salesAgg = await Order.aggregate([
    { $match: { "distributor_info.distributor_id": { $in: distributorIds.map((id) => new mongoose.Types.ObjectId(id)) }, createdAt: { $gte: since } } },
    { $unwind: "$items" },
    {
      $group: {
        _id: { distributor_id: "$distributor_info.distributor_id", sku: "$items.sku" },
        totalQty: { $sum: "$items.quantity" },
      },
    },
  ]);
  const avgSalesByKey = new Map<string, number>();
  for (const row of salesAgg) {
    const key = `${row._id.distributor_id}::${row._id.sku}`;
    avgSalesByKey.set(key, Math.round((row.totalQty / AVG_SALES_WINDOW_MONTHS) * 10) / 10);
  }

  return inventory.map((item) => {
    const distId = item.distributor_id?._id?.toString();
    return {
      ...item,
      cities: distId ? citiesByDistributor.get(distId) || [] : [],
      avg_monthly_sales: avgSalesByKey.get(`${distId}::${item.sku}`) || 0,
    };
  });
}

const router = express.Router();

function computeAlertStatus(current_stock: number, threshold_qty: number): "ok" | "low" | "critical" {
  if (current_stock <= 0) return "critical";
  if (current_stock <= threshold_qty) return "low";
  return "ok";
}

// INV-01/02/03: Create or configure an inventory record (SKU per distributor)
router.post(
  "/",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { distributor_id, product_id, current_stock, threshold_qty, lead_time_days } = req.body;

      if (!distributor_id || !product_id) {
        res.status(400).json({
          success: false,
          error: { code: "MISSING_FIELDS", message: "distributor_id and product_id are required" },
        });
        return;
      }

      const product = await Product.findById(product_id);
      if (!product) {
        res.status(404).json({ success: false, error: { code: "PRODUCT_NOT_FOUND", message: "Product not found" } });
        return;
      }

      const stock = current_stock ?? 0;
      const threshold = threshold_qty ?? 0;

      const inventory = await Inventory.findOneAndUpdate(
        { distributor_id, product_id },
        {
          distributor_id,
          product_id,
          sku: product.sku,
          current_stock: stock,
          threshold_qty: threshold,
          lead_time_days: lead_time_days ?? 0,
          alert_status: computeAlertStatus(stock, threshold),
          last_restocked_date: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.status(201).json({ success: true, data: inventory, message: "Inventory record saved" });
    } catch (error: any) {
      logger.error("Create inventory error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message || "Failed to save inventory" } });
    }
  }
);

// INV-08: Admin/Manager dashboard - list all inventory, optionally filtered
router.get(
  "/",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { distributor_id, alert_status, district_id } = req.query;
      const query: any = {};
      if (distributor_id) query.distributor_id = distributor_id;
      if (alert_status) query.alert_status = alert_status;

      let distributorIds: string[] | null = null;
      if (district_id) {
        const cities = await City.find({ district_id }).select("_id");
        const cityIds = cities.map((c) => c._id);
        const distributors = await Distributor.find({ city_id: { $in: cityIds } }).select("_id");
        distributorIds = distributors.map((d) => String(d._id));
        query.distributor_id = { $in: distributorIds };
      }

      const inventory = await Inventory.find(query)
        .populate("distributor_id", "name city_id")
        .populate("product_id", "name sku")
        .sort({ alert_status: 1, updatedAt: -1 })
        .lean();

      const enriched = await attachOutletCitiesAndAvgSales(inventory);

      res.json({ success: true, data: enriched });
    } catch (error: any) {
      logger.error("List inventory error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch inventory" } });
    }
  }
);

// INV-08: Low-stock alert dashboard, area-wise
router.get(
  "/alerts",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const alerts = await Inventory.find({ alert_status: { $in: ["low", "critical"] } })
        .populate("distributor_id", "name city_id phone")
        .populate("product_id", "name sku")
        .sort({ alert_status: 1 })
        .lean();

      res.json({ success: true, data: alerts });
    } catch (error: any) {
      logger.error("Inventory alerts error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch alerts" } });
    }
  }
);

// INV-07: Re-order suggestion for a given inventory record
router.get(
  "/:id/reorder-suggestion",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const inv = await Inventory.findById(req.params.id).lean();
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Inventory record not found" } });
        return;
      }
      // Simple heuristic: suggest replenishing to (threshold * 2) to cover the lead-time window
      const suggestedQty = Math.max(0, inv.threshold_qty * 2 - inv.current_stock);
      res.json({
        success: true,
        data: {
          sku: inv.sku,
          current_stock: inv.current_stock,
          threshold_qty: inv.threshold_qty,
          lead_time_days: inv.lead_time_days,
          suggested_reorder_qty: suggestedQty,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to compute suggestion" } });
    }
  }
);

// Update threshold/lead-time config or restock (adds to current_stock)
router.put(
  "/:id",
  authenticateAdmin,
  requireManagerOrAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const { threshold_qty, lead_time_days, restock_qty, set_current_stock } = req.body;

      const inv = await Inventory.findById(req.params.id);
      if (!inv) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Inventory record not found" } });
        return;
      }

      if (threshold_qty !== undefined) inv.threshold_qty = threshold_qty;
      if (lead_time_days !== undefined) inv.lead_time_days = lead_time_days;

      if (typeof restock_qty === "number" && restock_qty > 0) {
        inv.current_stock += restock_qty;
        inv.last_restocked_date = new Date();
      } else if (typeof set_current_stock === "number") {
        inv.current_stock = set_current_stock;
        inv.last_restocked_date = new Date();
      }

      inv.alert_status = computeAlertStatus(inv.current_stock, inv.threshold_qty);
      await inv.save();

      res.json({ success: true, data: inv, message: "Inventory updated" });
    } catch (error: any) {
      logger.error("Update inventory error:", error);
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to update inventory" } });
    }
  }
);

// Distributor's own stock view
router.get(
  "/distributor/mine",
  authenticateDistributor,
  async (req: DistributorAuthRequest, res: Response): Promise<void> => {
    try {
      const inventory = await Inventory.find({ distributor_id: req.distributor!.id })
        .populate("product_id", "name sku")
        .sort({ alert_status: 1 })
        .lean();
      res.json({ success: true, data: inventory });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch inventory" } });
    }
  }
);

export default router;
