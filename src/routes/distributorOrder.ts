import express, { Response } from 'express';
import Order from '../models/Order';
import { DistributorAuthRequest, authenticateDistributor } from '../middleware/distributorAuth';
import logger from '../config/logger';
import { restoreStockForOrder } from '../services/inventoryService';

const router = express.Router();

// Get all orders for authenticated distributor
router.get('/', authenticateDistributor, async (req: DistributorAuthRequest, res: Response): Promise<void> => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const query: any = {
      'patient_info.city_id': req.distributor!.city_id,
    };

    // Filter by status
    if (status) {
      query.order_status = status;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('prescription_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Order.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error('Get distributor orders error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch orders',
      },
    });
  }
});

// Get order by ID
router.get('/:id', authenticateDistributor, async (req: DistributorAuthRequest, res: Response): Promise<void> => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      'patient_info.city_id': req.distributor!.city_id,
    }).populate('prescription_id');

    if (!order) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Order not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error('Get distributor order error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch order',
      },
    });
  }
});

// Update order status (for distributors to manage their orders)
router.patch('/:id/status', authenticateDistributor, async (req: DistributorAuthRequest, res: Response): Promise<void> => {
  try {
    const { order_status, tracking_number, tracking_url } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      'patient_info.city_id': req.distributor!.city_id,
    });

    if (!order) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Order not found',
        },
      });
      return;
    }

    // Update fields
    if (order_status) {
      const validStatuses = ['pending', 'processing', 'fulfilled', 'cancelled'];
      if (!validStatuses.includes(order_status)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid order status',
          },
        });
        return;
      }
      order.order_status = order_status;
    }

    if (tracking_number !== undefined) {
      order.tracking_number = tracking_number;
    }

    if (tracking_url !== undefined) {
      order.tracking_url = tracking_url;
    }

    await order.save();

    if (order_status === 'cancelled') {
      restoreStockForOrder(order).catch((err) => {
        logger.error('Failed to restore inventory stock (non-blocking)', {
          orderId: order._id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    logger.info('Order status updated by distributor', {
      orderId: order._id,
      distributorId: req.distributor!.id,
      newStatus: order_status,
    });

    res.json({
      success: true,
      data: order,
      message: 'Order updated successfully',
    });
  } catch (error) {
    logger.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update order',
      },
    });
  }
});

// Get order statistics for distributor
router.get('/stats/summary', authenticateDistributor, async (req: DistributorAuthRequest, res: Response): Promise<void> => {
  try {
    const cityQuery = { 'patient_info.city_id': req.distributor!.city_id };

    const [totalOrders, pendingOrders, processingOrders, fulfilledOrders, totalRevenue] = await Promise.all([
      Order.countDocuments(cityQuery),
      Order.countDocuments({ ...cityQuery, order_status: 'pending' }),
      Order.countDocuments({ ...cityQuery, order_status: 'processing' }),
      Order.countDocuments({ ...cityQuery, order_status: 'fulfilled' }),
      Order.aggregate([
        { $match: { 'patient_info.city_id': req.distributor!.city_id } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        processingOrders,
        fulfilledOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    logger.error('Get distributor stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch statistics',
      },
    });
  }
});

export default router;
