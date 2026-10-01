import express, { Response } from "express";
import { authenticateDoctor, AuthRequest } from "../middleware/auth";
import {
  authenticateAdmin,
  requireSuperAdmin,
  AdminAuthRequest,
} from "../middleware/adminAuth";
import Prescription from "../models/Prescription";
import Patient from "../models/Patient";
import Doctor from "../models/Doctor";
import Order from "../models/Order";
import shopify from "../config/shopify";
import { restoreStockForOrder, deductStockForOrder, notifyOutletNewOrder } from "../services/inventoryService";

const router = express.Router();

// Create manual order by Super Admin
router.post(
  "/manual",
  authenticateAdmin,
  requireSuperAdmin,
  async (req: AdminAuthRequest, res: Response): Promise<void> => {
    try {
      const {
        patient_info,
        doctor_info,
        items,
        total_amount,
        currency,
        kam_id,
        distributor_info,
        dates,
      } = req.body;

      if (!patient_info || !doctor_info || !items || !total_amount) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_REQUIRED_FIELDS",
            message: "Patient, Doctor, Items, and Total Amount are required",
          },
        });
        return;
      }

      // Create order record
      const order = await Order.create({
        order_source: "manual",
        patient_info,
        doctor_info,
        items,
        total_amount,
        currency: currency || "PKR",
        kam_id,
        distributor_info,
        dates,
        order_status: "pending",
        financial_status: "pending",
        fulfillment_status: "unfulfilled",
      });

      deductStockForOrder(order).catch(() => {});
      notifyOutletNewOrder(order).catch(() => {});

      res.status(201).json({
        success: true,
        data: order,
        message: "Manual order created successfully",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error.message || "Failed to create manual order",
        },
      });
    }
  },
);

// Create Shopify order from prescription
router.post(
  "/create",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { prescription_id } = req.body;

      if (!prescription_id) {
        res.status(400).json({
          success: false,
          error: {
            code: "MISSING_PRESCRIPTION_ID",
            message: "Prescription ID is required",
          },
        });
        return;
      }

      // Fetch prescription with populated data
      const prescription = await Prescription.findOne({
        _id: prescription_id,
        doctor_id: req.doctor!.id,
      })
        .populate("patient_id")
        .populate("items.product_id")
        .lean();

      if (!prescription) {
        res.status(404).json({
          success: false,
          error: {
            code: "PRESCRIPTION_NOT_FOUND",
            message: "Prescription not found",
          },
        });
        return;
      }

      // Check if order already exists for this prescription
      if (prescription.shopify_order_id) {
        res.status(400).json({
          success: false,
          error: {
            code: "ORDER_ALREADY_EXISTS",
            message: "Order already created for this prescription",
          },
        });
        return;
      }

      const patient = prescription.patient_id as any;
      const doctor = await Doctor.findById(req.doctor!.id);

      // TODO: Integrate with Shopify API to create draft order
      // For now, we'll create a mock order
      const mockShopifyOrderId = `MOCK-${Date.now()}`;
      const mockOrderNumber = `#${Math.floor(Math.random() * 10000)}`;

      // Create order record
      const order = await Order.create({
        prescription_id: prescription._id,
        shopify_order_id: mockShopifyOrderId,
        shopify_order_number: mockOrderNumber,
        patient_info: {
          mrn: patient.mrn,
          name: patient.name,
          phone: patient.phone,
          address: patient.address,
        },
        doctor_info: {
          doctor_id: doctor!._id,
          name: doctor!.name,
          district_id: doctor!.district_id,
        },
        order_status: "pending",
        financial_status: "pending",
        fulfillment_status: "unfulfilled",
        total_amount: prescription.items.reduce(
          (sum: number, item: any) => sum + item.price * item.quantity,
          0,
        ),
        currency: "PKR",
        shopify_created_at: new Date(),
        shopify_updated_at: new Date(),
      });

      // Update prescription with Shopify order ID
      prescription.shopify_order_id = mockShopifyOrderId;
      prescription.order_status = "pending";
      await prescription.save();

      res.status(201).json({
        success: true,
        data: order,
        message: "Order created successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to create order",
        },
      });
    }
  },
);

// Get all orders for the authenticated doctor
router.get(
  "/",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orders = await Order.find({
        "doctor_info.doctor_id": req.doctor!.id,
      })
        .populate("prescription_id")
        .sort({ created_at: -1 })
        .lean();

      res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch orders",
        },
      });
    }
  },
);

// Get order by ID
router.get(
  "/:id",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const order = await Order.findOne({
        _id: req.params.id,
        "doctor_info.doctor_id": req.doctor!.id,
      })
        .populate("prescription_id")
        .lean();

      if (!order) {
        res.status(404).json({
          success: false,
          error: {
            code: "ORDER_NOT_FOUND",
            message: "Order not found",
          },
        });
        return;
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch order",
        },
      });
    }
  },
);

// Get order by prescription ID
router.get(
  "/prescription/:prescriptionId",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const order = await Order.findOne({
        prescription_id: req.params.prescriptionId,
        "doctor_info.doctor_id": req.doctor!.id,
      }).lean();

      if (!order) {
        res.status(404).json({
          success: false,
          error: {
            code: "ORDER_NOT_FOUND",
            message: "Order not found",
          },
        });
        return;
      }

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to fetch order",
        },
      });
    }
  },
);

// Sync order status from Shopify
router.post(
  "/:id/sync",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const order = await Order.findOne({
        _id: req.params.id,
        "doctor_info.doctor_id": req.doctor!.id,
      }).populate("prescription_id");

      if (!order) {
        res.status(404).json({
          success: false,
          error: {
            code: "ORDER_NOT_FOUND",
            message: "Order not found",
          },
        });
        return;
      }

      // Check if this is a non-Shopify order (LOCAL orders)
      if (order.shopify_order_id?.startsWith("LOCAL-")) {
        // Non-Shopify orders don't need syncing, return current data
        res.json({
          success: true,
          data: order,
          message: "Non-Shopify order - no sync needed",
        });
        return;
      }

      // Fetch latest status from Shopify
      try {
        const session = shopify.session.customAppSession(
          process.env.SHOPIFY_STORE_URL!,
        );
        session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;
        const client = new shopify.clients.Rest({ session });

        const response = await client.get({
          path: `orders/${order.shopify_order_id}`,
        });

        const shopifyOrder = response.body.order;

        // Determine order status
        let orderStatus = "pending";
        if (shopifyOrder.cancelled_at) {
          orderStatus = "cancelled";
        } else if (shopifyOrder.fulfillment_status === "fulfilled") {
          orderStatus = "fulfilled";
        } else if (shopifyOrder.financial_status === "paid") {
          orderStatus = "processing";
        }

        // Extract tracking information from fulfillments
        let trackingNumber = order.tracking_number;
        let trackingUrl = order.tracking_url;

        if (shopifyOrder.fulfillments && shopifyOrder.fulfillments.length > 0) {
          const latestFulfillment =
            shopifyOrder.fulfillments[shopifyOrder.fulfillments.length - 1];
          trackingNumber = latestFulfillment.tracking_number || trackingNumber;
          trackingUrl = latestFulfillment.tracking_url || trackingUrl;
        }

        // Update order with latest Shopify data
        const updatedOrder = await Order.findByIdAndUpdate(
          order._id,
          {
            order_status: orderStatus,
            financial_status: shopifyOrder.financial_status,
            fulfillment_status:
              shopifyOrder.fulfillment_status || "unfulfilled",
            tracking_number: trackingNumber,
            tracking_url: trackingUrl,
            total_amount: parseFloat(shopifyOrder.total_price || "0"),
            shopify_updated_at: new Date(shopifyOrder.updated_at),
            updated_at: new Date(),
          },
          { new: true },
        ).populate("prescription_id");

        // Also update prescription status
        if (order.prescription_id) {
          await Prescription.findByIdAndUpdate(order.prescription_id, {
            order_status: orderStatus,
          });
        }

        if (orderStatus === "cancelled" && updatedOrder) {
          restoreStockForOrder(updatedOrder).catch(() => {});
        }

        res.json({
          success: true,
          data: updatedOrder,
          message: "Order status synced successfully",
        });
      } catch (shopifyError: any) {
        // Return current order data if Shopify sync fails
        res.json({
          success: true,
          data: order,
          message: "Could not sync with Shopify, returning cached data",
          warning: "Shopify sync failed",
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to sync order",
        },
      });
    }
  },
);

// Bulk sync orders - sync multiple orders at once
router.post(
  "/bulk-sync",
  authenticateDoctor,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { order_ids } = req.body;

      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "order_ids array is required",
          },
        });
        return;
      }

      // Fetch orders
      const orders = await Order.find({
        _id: { $in: order_ids },
        "doctor_info.doctor_id": req.doctor!.id,
      }).lean();

      if (orders.length === 0) {
        res.json({
          success: true,
          data: {
            synced: 0,
            failed: 0,
            orders: [],
          },
          message: "No orders found to sync",
        });
        return;
      }

      // Initialize Shopify Client
      const session = shopify.session.customAppSession(
        process.env.SHOPIFY_STORE_URL!,
      );
      session.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;
      const client = new shopify.clients.Rest({ session });

      // OPTIMIZED: Parallel Execution using Promise.allSettled
      // This allows multiple syncs to happen at once, drastically reducing wait time.

      const syncPromises = orders.map(async (order) => {
        try {
          const response = await client.get({
            path: `orders/${order.shopify_order_id}`,
          });

          const shopifyOrder = response.body.order;

          // Determine order status
          let orderStatus = "pending";
          if (shopifyOrder.cancelled_at) {
            orderStatus = "cancelled";
          } else if (shopifyOrder.fulfillment_status === "fulfilled") {
            orderStatus = "fulfilled";
          } else if (shopifyOrder.financial_status === "paid") {
            orderStatus = "processing";
          }

          // Extract tracking information
          let trackingNumber = order.tracking_number;
          let trackingUrl = order.tracking_url;

          if (
            shopifyOrder.fulfillments &&
            shopifyOrder.fulfillments.length > 0
          ) {
            const latestFulfillment =
              shopifyOrder.fulfillments[shopifyOrder.fulfillments.length - 1];
            trackingNumber =
              latestFulfillment.tracking_number || trackingNumber;
            trackingUrl = latestFulfillment.tracking_url || trackingUrl;
          }

          // Update order
          const updatedOrder = await Order.findByIdAndUpdate(
            order._id,
            {
              order_status: orderStatus,
              financial_status: shopifyOrder.financial_status,
              fulfillment_status:
                shopifyOrder.fulfillment_status || "unfulfilled",
              tracking_number: trackingNumber,
              tracking_url: trackingUrl,
              total_amount: parseFloat(shopifyOrder.total_price || "0"),
              shopify_updated_at: new Date(shopifyOrder.updated_at),
              updated_at: new Date(),
            },
            { new: true },
          );

          // Update prescription status
          if (order.prescription_id) {
            await Prescription.findByIdAndUpdate(order.prescription_id, {
              order_status: orderStatus,
            });
          }

          if (orderStatus === "cancelled" && updatedOrder) {
            restoreStockForOrder(updatedOrder).catch(() => {});
          }

          return updatedOrder;
        } catch (error) {
          throw error;
        }
      });

      const results = await Promise.allSettled(syncPromises);

      const syncedOrders: any[] = [];
      let synced = 0;
      let failed = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          syncedOrders.push(result.value);
          synced++;
        } else {
          failed++;
        }
      });

      res.json({
        success: true,
        data: {
          synced,
          failed,
          total: orders.length,
          orders: syncedOrders,
        },
        message: `Synced ${synced} out of ${orders.length} orders`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to bulk sync orders",
        },
      });
    }
  },
);

export default router;
