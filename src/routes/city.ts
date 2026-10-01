import express, { Request, Response } from 'express';
import City from '../models/City';
import logger from '../config/logger';

const router = express.Router();

// Public endpoint: Get all active cities (for App)
router.get('/public', async (req: Request, res: Response): Promise<void> => {
  try {
    const cities = await City.find({ status: 'active' })
      .select('name distributor_channel')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: cities,
    });
  } catch (error) {
    logger.error('Get public cities error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch cities',
      },
    });
  }
});

export default router;
