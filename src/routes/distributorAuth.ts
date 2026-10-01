import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Distributor from '../models/Distributor';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { validate } from '../middleware/validate';
import { loginSchema } from '../validators/auth.validator';
import { authLimiter } from '../middleware/security';
import { DistributorAuthRequest, authenticateDistributor } from '../middleware/distributorAuth';

const router = express.Router();

// Distributor Login
router.post('/distributor/login', authLimiter, validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find distributor
    const distributor = await Distributor.findOne({ email: email.toLowerCase() });
    if (!distributor) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    // Check if distributor is active
    if (distributor.status !== 'active') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Your account is inactive. Please contact support.',
        },
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, distributor.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      id: String(distributor._id),
      email: distributor.email,
      role: 'distributor',
    });

    const refreshToken = generateRefreshToken({
      id: String(distributor._id),
      email: distributor.email,
      role: 'distributor',
    });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        distributor: {
          id: distributor._id,
          email: distributor.email,
          name: distributor.name,
          phone: distributor.phone,
          city_id: distributor.city_id,
        },
      },
      message: 'Login successful',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred during login',
      },
    });
  }
});

// Get current distributor profile
router.get('/distributor/me', authenticateDistributor, async (req: DistributorAuthRequest, res: Response): Promise<void> => {
  try {
    const distributor = await Distributor.findById(req.distributor!.id).select('-password');

    if (!distributor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Distributor not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: distributor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch profile',
      },
    });
  }
});

export default router;
