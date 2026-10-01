import express, { Request, Response } from 'express';
import Prescription from '../models/Prescription';
import Order from '../models/Order';
import { verifyWebhookMiddleware } from '../utils/shopify';
import { restoreStockForOrder } from '../services/inventoryService';

const router = express.Router();

/**
 * Shopify Order Created Webhook
 * Triggered when a new order is created in Shopify
 */
router.post('/shopify/orders/create', verifyWebhookMiddleware, async (req: Request, res: Response) => {
  try {
    const shopifyOrder = req.body;
    // Extract prescription ID from metafields
    const prescriptionId = shopifyOrder.note_attributes?.find(
      (attr: any) => attr.name === 'prescription_id'
    )?.value || shopifyOrder.id; // Fallback to order ID if not found

    // Update prescription
    if (prescriptionId) {
      await Prescription.findByIdAndUpdate(prescriptionId, {
        shopify_order_id: shopifyOrder.id.toString(),
        shopify_order_number: shopifyOrder.name,
        order_status: 'processing'
      });
    }

    // Create/update order record
    await Order.findOneAndUpdate(
      { shopify_order_id: shopifyOrder.id.toString() },
      {
        shopify_order_id: shopifyOrder.id.toString(),
        shopify_order_number: shopifyOrder.name,
        order_status: 'processing',
        financial_status: shopifyOrder.financial_status,
        fulfillment_status: shopifyOrder.fulfillment_status || 'unfulfilled',
        total_amount: parseFloat(shopifyOrder.total_price),
        currency: shopifyOrder.currency,
        shopify_created_at: new Date(shopifyOrder.created_at),
        shopify_updated_at: new Date(shopifyOrder.updated_at),
        updated_at: new Date()
      },
      { upsert: true, new: true }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_ERROR',
        message: 'Failed to process webhook'
      }
    });
  }
});

/**
 * Shopify Order Updated Webhook
 * Triggered when an order is updated in Shopify (address added, payment confirmed, etc.)
 */
router.post('/shopify/orders/update', verifyWebhookMiddleware, async (req: Request, res: Response) => {
  try {
    const shopifyOrder = req.body;
    // Update order in database
    const order = await Order.findOneAndUpdate(
      { shopify_order_id: shopifyOrder.id.toString() },
      {
        order_status: shopifyOrder.cancelled_at ? 'cancelled' :
                     shopifyOrder.fulfillment_status === 'fulfilled' ? 'fulfilled' :
                     'processing',
        financial_status: shopifyOrder.financial_status,
        fulfillment_status: shopifyOrder.fulfillment_status || 'unfulfilled',
        total_amount: parseFloat(shopifyOrder.total_price),
        shopify_updated_at: new Date(shopifyOrder.updated_at),
        updated_at: new Date()
      },
      { new: true }
    );

    if (order) {
      // Update prescription status
      await Prescription.findByIdAndUpdate(order.prescription_id, {
        order_status: order.order_status
      });

      if (order.order_status === 'cancelled') {
        restoreStockForOrder(order).catch(() => {});
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_ERROR',
        message: 'Failed to process webhook'
      }
    });
  }
});

/**
 * Shopify Order Fulfilled Webhook
 * Triggered when an order is marked as fulfilled (shipped)
 */
router.post('/shopify/orders/fulfilled', verifyWebhookMiddleware, async (req: Request, res: Response) => {
  try {
    const fulfillment = req.body;
    // Extract tracking information
    const trackingNumber = fulfillment.tracking_number;
    const trackingUrl = fulfillment.tracking_url;

    // Update order in database
    const order = await Order.findOneAndUpdate(
      { shopify_order_id: fulfillment.order_id.toString() },
      {
        order_status: 'fulfilled',
        fulfillment_status: 'fulfilled',
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        shopify_updated_at: new Date(fulfillment.updated_at),
        updated_at: new Date()
      },
      { new: true }
    );

    if (order) {
      // Update prescription status
      await Prescription.findByIdAndUpdate(order.prescription_id, {
        order_status: 'fulfilled'
      });
      // TODO: Send push notification to doctor
      // await sendPushNotification(order.doctor_info.doctor_id, {
      //   title: 'Order Fulfilled',
      //   body: `Order ${order.shopify_order_number} has been shipped!`,
      //   data: { orderId: order._id.toString() }
      // });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_ERROR',
        message: 'Failed to process webhook'
      }
    });
  }
});

/**
 * Shopify Order Cancelled Webhook
 * Triggered when an order is cancelled in Shopify
 */
router.post('/shopify/orders/cancelled', verifyWebhookMiddleware, async (req: Request, res: Response) => {
  try {
    const shopifyOrder = req.body;
    // Update order in database
    const order = await Order.findOneAndUpdate(
      { shopify_order_id: shopifyOrder.id.toString() },
      {
        order_status: 'cancelled',
        shopify_updated_at: new Date(shopifyOrder.updated_at),
        updated_at: new Date()
      },
      { new: true }
    );

    if (order) {
      // Update prescription status
      await Prescription.findByIdAndUpdate(order.prescription_id, {
        order_status: 'cancelled'
      });

      restoreStockForOrder(order).catch(() => {});
      // TODO: Send push notification to doctor
      // await sendPushNotification(order.doctor_info.doctor_id, {
      //   title: 'Order Cancelled',
      //   body: `Order ${order.shopify_order_number} has been cancelled`,
      //   data: { orderId: order._id.toString() }
      // });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_ERROR',
        message: 'Failed to process webhook'
      }
    });
  }
});

export default router;
