import express, { Response } from "express";
import Order from "../models/Order";
import { authenticateAdmin, AdminAuthRequest } from "../middleware/adminAuth";
import { requireRole } from "../middleware/role";
import logger from "../config/logger";
import { parseReportFilterParams, buildOrderFilterMatch } from "../services/reportFilters";

const router = express.Router();

const canViewReports = requireRole(["super_admin", "kam", "director", "sales_manager"]);

function dateRangeMatch(from?: string, to?: string) {
  if (!from && !to) return {};
  const range: any = {};
  if (from) range.$gte = new Date(from as string);
  if (to) {
    const end = new Date(to as string);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  // Orders may have been created via this backend service (createdAt) or the
  // admin app's manual-order flow (created_at) against the same MongoDB collection.
  return { $or: [{ createdAt: range }, { created_at: range }] };
}

/**
 * Classify every order into New / Repeat / Old for a given patient key.
 * New = the patient's first-ever order. Repeat = explicitly flagged repeat_order.
 * Old = an existing (non-first) order that wasn't flagged as a repeat purchase.
 */
async function classifyPatientOrders(dateMatch: any) {
  const firstOrderByPatient = await Order.aggregate([
    { $match: { "patient_info.mrn": { $exists: true, $ne: null } } },
    { $group: { _id: "$patient_info.mrn", firstOrderId: { $min: "$_id" }, firstDate: { $min: "$createdAt" } } },
  ]);
  const firstOrderMap = new Map(firstOrderByPatient.map((f: any) => [String(f._id), String(f.firstOrderId)]));

  const orders = await Order.find(dateMatch)
    .select("patient_info repeat_order total_amount order_status createdAt doctor_info")
    .lean();

  const categorized = { new: [] as any[], repeat: [] as any[], old: [] as any[] };
  for (const order of orders) {
    const mrn = order.patient_info?.mrn;
    const isFirst = mrn && firstOrderMap.get(mrn) === String(order._id);
    if (isFirst) categorized.new.push(order);
    else if (order.repeat_order) categorized.repeat.push(order);
    else categorized.old.push(order);
  }
  return categorized;
}

// 1) Patient-wise Report: Old / New / Repeat
router.get("/patient-wise", authenticateAdmin, canViewReports, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const dateMatch = dateRangeMatch(from as string, to as string);

    const { match: filterMatch, itemMatch, empty } = await buildOrderFilterMatch(parseReportFilterParams(req.query));
    if (empty) {
      res.json({
        success: true,
        data: {
          new: { count: 0, total_revenue: 0, orders: [] },
          repeat: { count: 0, total_revenue: 0, orders: [] },
          old: { count: 0, total_revenue: 0, orders: [] },
        },
      });
      return;
    }

    const categorized = await classifyPatientOrders({ ...dateMatch, ...filterMatch, ...(itemMatch || {}) });

    const summarize = (list: any[]) => ({
      count: list.length,
      total_revenue: list.reduce((sum, o) => sum + (o.order_status === "cancelled" ? 0 : (o.total_amount || 0)), 0),
    });

    res.json({
      success: true,
      data: {
        new: { ...summarize(categorized.new), orders: categorized.new },
        repeat: { ...summarize(categorized.repeat), orders: categorized.repeat },
        old: { ...summarize(categorized.old), orders: categorized.old },
      },
    });
  } catch (error: any) {
    logger.error("Patient-wise report error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build patient-wise report" } });
  }
});

// 2) Doctor-wise Report: Product-wise orders + revenue per doctor
router.get("/doctor-wise", authenticateAdmin, canViewReports, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const dateMatch = dateRangeMatch(from as string, to as string);

    const { match: filterMatch, itemMatch, empty } = await buildOrderFilterMatch(parseReportFilterParams(req.query));
    if (empty) {
      res.json({ success: true, data: [] });
      return;
    }

    const data = await Order.aggregate([
      { $match: { ...dateMatch, ...filterMatch } },
      { $unwind: "$items" },
      ...(itemMatch ? [{ $match: itemMatch }] : []),
      {
        $group: {
          _id: { doctor_id: "$doctor_info.doctor_id", doctor_name: "$doctor_info.name", product: "$items.name" },
          orders: { $sum: 1 },
          quantity: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$order_status", "cancelled"] },
                0,
                { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 0] }] },
              ],
            },
          },
        },
      },
      { $sort: { "_id.doctor_name": 1, revenue: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error("Doctor-wise report error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build doctor-wise report" } });
  }
});

// 3) City-wise Report: Orders and sales by city
router.get("/city-wise", authenticateAdmin, canViewReports, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const dateMatch = dateRangeMatch(from as string, to as string);

    const { match: filterMatch, itemMatch, empty } = await buildOrderFilterMatch(parseReportFilterParams(req.query));
    if (empty) {
      res.json({ success: true, data: [] });
      return;
    }

    const data = await Order.aggregate([
      { $match: { ...dateMatch, ...filterMatch, ...(itemMatch || {}) } },
      {
        $group: {
          _id: { city_id: "$patient_info.city_id", city_name: "$patient_info.city_name" },
          orders: { $sum: 1 },
          total_sales: {
            $sum: { $cond: [{ $eq: ["$order_status", "cancelled"] }, 0, "$total_amount"] },
          },
        },
      },
      { $sort: { total_sales: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error("City-wise report error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build city-wise report" } });
  }
});

// 4) Product-wise Report: orders, sales, revenue per product
router.get("/product-wise", authenticateAdmin, canViewReports, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const dateMatch = dateRangeMatch(from as string, to as string);

    const { match: filterMatch, itemMatch, empty } = await buildOrderFilterMatch(parseReportFilterParams(req.query));
    if (empty) {
      res.json({ success: true, data: [] });
      return;
    }

    const data = await Order.aggregate([
      { $match: { ...dateMatch, ...filterMatch } },
      { $unwind: "$items" },
      ...(itemMatch ? [{ $match: itemMatch }] : []),
      {
        $group: {
          _id: { sku: "$items.sku", name: "$items.name" },
          orders: { $sum: 1 },
          quantity_sold: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$order_status", "cancelled"] },
                0,
                { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 0] }] },
              ],
            },
          },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error("Product-wise report error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build product-wise report" } });
  }
});

// 5) KAM-wise Report: Product-wise orders/sales from New and Repeat patients
router.get("/kam-wise", authenticateAdmin, canViewReports, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const dateMatch = dateRangeMatch(from as string, to as string);

    const { match: filterMatch, itemMatch, empty } = await buildOrderFilterMatch(parseReportFilterParams(req.query));
    if (empty) {
      res.json({ success: true, data: { new_patients: [], repeat_patients: [] } });
      return;
    }

    const categorized = await classifyPatientOrders({ ...dateMatch, ...filterMatch });

    const buildAgg = async (orderIds: any[]) => {
      if (orderIds.length === 0) return [];
      return Order.aggregate([
        { $match: { _id: { $in: orderIds } } },
        // Most orders (created via the agent/mobile flow) never set kam_id
        // directly - KAM ownership actually lives on the doctor's District.
        // Fall back to district.kam_id when the order doesn't have its own.
        {
          $lookup: {
            from: "districts",
            localField: "doctor_info.district_id",
            foreignField: "_id",
            as: "district",
          },
        },
        {
          $addFields: {
            resolved_kam_id: { $ifNull: ["$kam_id", { $arrayElemAt: ["$district.kam_id", 0] }] },
          },
        },
        { $unwind: "$items" },
        ...(itemMatch ? [{ $match: itemMatch }] : []),
        {
          $group: {
            _id: { kam_id: "$resolved_kam_id", product: "$items.name" },
            orders: { $sum: 1 },
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ["$order_status", "cancelled"] },
                  0,
                  { $multiply: ["$items.quantity", { $ifNull: ["$items.price", 0] }] },
                ],
              },
            },
          },
        },
        { $sort: { revenue: -1 } },
      ]);
    };

    // KAM-wise only has two buckets (New/Repeat) - any non-first order counts
    // as a repeat, regardless of whether staff explicitly flagged it via the
    // manual "Reorder" action (see classifyPatientOrders' `old` bucket, which
    // patient-wise reports separately but which is meaningless here).
    const [newData, repeatData] = await Promise.all([
      buildAgg(categorized.new.map((o) => o._id)),
      buildAgg([...categorized.repeat, ...categorized.old].map((o) => o._id)),
    ]);

    res.json({ success: true, data: { new_patients: newData, repeat_patients: repeatData } });
  } catch (error: any) {
    logger.error("KAM-wise report error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build KAM-wise report" } });
  }
});

// 6) Outlet-wise Report: Outlet/distributor orders, sales, revenue
router.get("/outlet-wise", authenticateAdmin, canViewReports, async (req: AdminAuthRequest, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;
    const dateMatch = dateRangeMatch(from as string, to as string);

    const { match: filterMatch, itemMatch, empty } = await buildOrderFilterMatch(parseReportFilterParams(req.query));
    if (empty) {
      res.json({ success: true, data: [] });
      return;
    }

    const data = await Order.aggregate([
      {
        $match: {
          ...dateMatch,
          ...filterMatch,
          ...(itemMatch || {}),
          "distributor_info.distributor_id": { $exists: true },
        },
      },
      {
        $group: {
          _id: { distributor_id: "$distributor_info.distributor_id", distributor_name: "$distributor_info.name" },
          orders: { $sum: 1 },
          total_sales: {
            $sum: { $cond: [{ $eq: ["$order_status", "cancelled"] }, 0, "$total_amount"] },
          },
        },
      },
      { $sort: { total_sales: -1 } },
    ]);

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error("Outlet-wise report error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to build outlet-wise report" } });
  }
});

export default router;
