import express, { Request, Response } from "express";
import Order from "../models/Order";
import logger from "../config/logger";

const router = express.Router();

// OPM-04: Public (no-auth) patient rating submission via WhatsApp link
router.get("/:orderId", async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await Order.findById(req.params.orderId)
      .select("shopify_order_number patient_info outlet_performance delivery order_status")
      .lean();
    if (!order) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }
    res.json({
      success: true,
      data: {
        order_number: order.shopify_order_number,
        patient_name: order.patient_info?.name,
        already_rated: !!order.outlet_performance?.rating_value,
        delivery_status: order.delivery?.delivery_status,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to fetch order" } });
  }
});

router.post("/:orderId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { rating_value, comments, timeliness, product_condition, rider_behavior } = req.body;

    if (!rating_value || rating_value < 1 || rating_value > 5) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "rating_value must be between 1 and 5" } });
      return;
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Order not found" } });
      return;
    }

    if (order.outlet_performance?.rating_value) {
      res.status(400).json({ success: false, error: { code: "ALREADY_RATED", message: "This order has already been rated" } });
      return;
    }

    order.outlet_performance = {
      ...(order.outlet_performance || ({} as any)),
      rating_value,
      rating_comments: comments,
      rating_criteria: { timeliness, product_condition, rider_behavior },
      rating_date: new Date(),
    };
    await order.save();

    res.json({ success: true, message: "Thank you for your feedback!" });
  } catch (error: any) {
    logger.error("Submit rating error:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Failed to submit rating" } });
  }
});

export default router;
