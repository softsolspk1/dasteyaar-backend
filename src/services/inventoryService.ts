import mongoose from "mongoose";
import Inventory from "../models/Inventory";
import Distributor from "../models/Distributor";
import City from "../models/City";
import District from "../models/District";
import User from "../models/User";
import Notification from "../models/Notification";
import greenApiService from "./greenApiService";
import logger from "../config/logger";
import { IOrder } from "../models/Order";

function distributorIdFromCity(city: any): mongoose.Types.ObjectId | null {
  if (!city || !city.distributor_ids || city.distributor_ids.length === 0) return null;
  return city.distributor_ids[0] as mongoose.Types.ObjectId;
}

/**
 * Resolve which distributor an order's stock should be deducted from.
 * Falls back to the first distributor mapped to the order's city if
 * distributor_info was not explicitly set at order-creation time.
 */
export async function resolveDistributorId(order: IOrder): Promise<mongoose.Types.ObjectId | null> {
  if (order.distributor_info?.distributor_id) {
    return order.distributor_info.distributor_id as mongoose.Types.ObjectId;
  }

  const cityId = order.patient_info?.city_id;
  if (cityId) {
    const city = await City.findById(cityId).lean();
    const distId = distributorIdFromCity(city);
    if (distId) return distId;
  }

  const cityName = order.patient_info?.city_name || (order.patient_info as any)?.city;
  if (cityName) {
    const city = await City.findOne({ name: new RegExp('^' + cityName.trim() + '$', 'i') }).lean();
    const distId = distributorIdFromCity(city);
    if (distId) return distId;
  }

  return null;
}

/**
 * Notify the outlet/distributor's WhatsApp number with the placed order's
 * patient details so the outlet can start processing/dispatch. Fires once
 * per order, right after creation, alongside the existing stock deduction.
 */
export async function notifyOutletNewOrder(order: IOrder): Promise<void> {
  try {
    const distributorId = await resolveDistributorId(order);
    if (!distributorId) {
      logger.warn("notifyOutletNewOrder: No distributor resolved for order", { orderId: order._id });
      return;
    }

    const distributor = await Distributor.findById(distributorId).lean();
    if (!distributor || !(distributor as any).phone) {
      logger.warn("notifyOutletNewOrder: No phone for distributor", { distributorId });
      return;
    }

    const rawPhones = String((distributor as any).phone).split(/[,;/|\n]+/);
    const validPhones = rawPhones
      .map((p) => p.trim())
      .filter((p) => {
        const digits = p.replace(/\D/g, "");
        return digits.length >= 10 && !/^0+$/.test(digits);
      });

    if (validPhones.length === 0) {
      logger.warn("notifyOutletNewOrder: No valid phone numbers for distributor", { distributorName: (distributor as any).name });
      return;
    }

    const itemsSummary = (order.items || [])
      .map((item: any) => `${item.name} x${item.quantity}`)
      .join(", ");

    const message = `🆕 *New Patient Order*\n\n*Order #:* ${(order as any).shopify_order_number || order._id}\n*Patient Name:* ${order.patient_info?.name || "N/A"}\n*Phone:* ${order.patient_info?.phone || "N/A"}\n*MRN:* ${order.patient_info?.mrn || "N/A"}\n*Delivery Address:* ${order.patient_info?.address || (order.patient_info as any)?.location || "N/A"}\n*Prescribing Doctor:* ${order.doctor_info?.name || "N/A"}\n*Medications:* ${itemsSummary}\n*Total Amount:* PKR ${(order.total_amount || 0).toLocaleString()}\n\n*Please process and dispatch this order.*`;

    for (const phone of validPhones) {
      logger.info(`Sending outlet WhatsApp alert to ${phone} for order ${(order as any).shopify_order_number || order._id}`);
      greenApiService.sendMessage(phone, message).catch((err) => {
        logger.error(`Failed to send outlet alert WhatsApp to ${phone}:`, { error: err.message });
      });
    }
  } catch (error) {
    logger.error("Failed to send outlet order alert (non-blocking)", {
      orderId: order._id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface StockAvailabilityItem {
  sku: string;
  requested: number;
  available: number;
}

export interface StockAvailabilityResult {
  blocked: boolean;
  blockedItems: StockAvailabilityItem[];
  warnings: StockAvailabilityItem[];
}

/**
 * INV-06 acceptance criteria: no order can be confirmed if stock is fully
 * unavailable (current_stock <= 0). Partial availability (some stock, but
 * less than requested) is allowed through with a warning rather than blocked.
 * SKUs with no inventory record configured for the distributor are untracked
 * and never block (consistent with deductStockForOrder's existing behavior).
 */
export async function checkStockAvailability(
  items: { sku?: string; quantity: number }[],
  city: any
): Promise<StockAvailabilityResult> {
  const result: StockAvailabilityResult = { blocked: false, blockedItems: [], warnings: [] };

  const distributorId = distributorIdFromCity(city);
  if (!distributorId) return result;

  for (const item of items) {
    if (!item.sku) continue;
    const inv = await Inventory.findOne({ distributor_id: distributorId, sku: item.sku }).lean();
    if (!inv) continue;

    if (inv.current_stock <= 0) {
      result.blocked = true;
      result.blockedItems.push({ sku: item.sku, requested: item.quantity, available: inv.current_stock });
    } else if (inv.current_stock < item.quantity) {
      result.warnings.push({ sku: item.sku, requested: item.quantity, available: inv.current_stock });
    }
  }

  return result;
}

async function recomputeAlertStatus(inv: any): Promise<"ok" | "low" | "critical"> {
  if (inv.current_stock <= 0) return "critical";
  if (inv.current_stock <= inv.threshold_qty) return "low";
  return "ok";
}

async function notifyLowStock(inv: any): Promise<void> {
  try {
    const distributor = await Distributor.findById(inv.distributor_id).lean();
    if (!distributor) return;

    // Cities reference their distributor(s) via City.distributor_ids (an
    // outlet can serve more than one city) - Distributor.city_id is a
    // legacy single back-reference that's never populated at creation time,
    // so resolving through it here silently dropped every district/sales
    // manager notification. Look the city up from the City side instead.
    const city = await City.findOne({ distributor_ids: distributor._id }).lean();
    const district = city?.district_id ? await District.findById(city.district_id).lean() : null;

    const message = `⚠️ Low Stock Alert\nSKU: ${inv.sku}\nDistributor: ${distributor.name}\nCurrent Stock: ${inv.current_stock}\nThreshold: ${inv.threshold_qty}\nPlease arrange replenishment (lead time: ${inv.lead_time_days} day(s)).`;

    // Notify distributor via WhatsApp
    if (distributor.phone) {
      greenApiService.sendMessage(distributor.phone, message).catch(() => {});
    }

    // In-app notification for distributor
    await Notification.create({
      recipient_type: "distributor",
      recipient_id: distributor._id,
      title: "Low Stock Alert",
      body: `${inv.sku} is at ${inv.current_stock} units (threshold ${inv.threshold_qty}).`,
      type: "inventory_alert",
      metadata: { inventory_id: inv._id, sku: inv.sku },
    });

    // Notify the area Sales Manager assigned to this district, if any
    if (district?.sales_manager_id) {
      const manager = await User.findById(district.sales_manager_id).lean();
      if (manager) {
        await Notification.create({
          recipient_type: "user",
          recipient_id: manager._id,
          title: "Low Stock Alert",
          body: `${inv.sku} at ${distributor.name} is at ${inv.current_stock} units (threshold ${inv.threshold_qty}).`,
          type: "inventory_alert",
          metadata: { inventory_id: inv._id, sku: inv.sku, distributor_id: distributor._id },
        });
      }
    }
  } catch (error) {
    logger.error("Failed to send low stock notification", {
      error: error instanceof Error ? error.message : String(error),
      inventoryId: inv._id,
    });
  }
}

/**
 * Deduct stock for every SKU-tracked line item on an order.
 * Idempotent via order.inventory_adjustment.deducted flag (caller's responsibility to persist it).
 */
export async function deductStockForOrder(order: IOrder): Promise<void> {
  if (order.inventory_adjustment?.deducted) return;

  const distributorId = await resolveDistributorId(order);
  if (!distributorId) return;

  for (const item of order.items) {
    if (!item.sku) continue;
    const inv = await Inventory.findOne({ distributor_id: distributorId, sku: item.sku });
    if (!inv) continue; // No inventory tracking configured for this SKU/distributor combo

    inv.current_stock = Math.max(0, inv.current_stock - item.quantity);
    const previousStatus = inv.alert_status;
    inv.alert_status = await recomputeAlertStatus(inv);
    await inv.save();

    if (inv.alert_status !== "ok" && previousStatus === "ok") {
      await notifyLowStock(inv);
    }
  }

  order.inventory_adjustment = { deducted: true, restored: order.inventory_adjustment?.restored || false };
  await (order as any).save();
}

/**
 * Restore stock when an order is cancelled/returned.
 * Idempotent via order.inventory_adjustment.restored flag (caller's responsibility to persist it).
 */
export async function restoreStockForOrder(order: IOrder): Promise<void> {
  if (!order.inventory_adjustment?.deducted || order.inventory_adjustment?.restored) return;

  const distributorId = await resolveDistributorId(order);
  if (!distributorId) return;

  for (const item of order.items) {
    if (!item.sku) continue;
    const inv = await Inventory.findOne({ distributor_id: distributorId, sku: item.sku });
    if (!inv) continue;

    inv.current_stock = inv.current_stock + item.quantity;
    inv.alert_status = await recomputeAlertStatus(inv);
    await inv.save();
  }

  order.inventory_adjustment = { deducted: true, restored: true };
  await (order as any).save();
}
