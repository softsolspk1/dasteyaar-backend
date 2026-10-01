import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { validate } from '../middleware/validate';
import { loginSchema, refreshTokenSchema } from '../validators/auth.validator';
import { authLimiter } from '../middleware/security';
import logger from '../config/logger';

const router = express.Router();

// Admin/KAM Login
router.post('/admin/login', authLimiter, validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find user (admin or KAM)
    const user = await User.findOne({ email: email.toLowerCase() })
      .populate('assigned_districts', 'name code');

    if (!user) {
      logger.warn('Failed login attempt - user not found', { email });
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    // Check if user is active
    if (user.status !== 'active') {
      logger.warn('Login attempt by inactive user', { email, userId: user._id });
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
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn('Failed login attempt - invalid password', { email });
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
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      assigned_districts: user.assigned_districts?.map(d => d.toString()),
    });

    const refreshToken = generateRefreshToken({
      id: user._id.toString(),
      email: user.email,
    });

    logger.info('Admin/KAM login successful', {
      userId: user._id,
      role: user.role,
      email: user.email,
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          assigned_districts: user.assigned_districts,
        },
      },
      message: 'Login successful',
    });
  } catch (error: any) {
    logger.error('Admin login error:', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred during login',
      },
    });
  }
});

// Refresh Token (same for both admin and doctor)
router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const decoded = verifyRefreshToken(refreshToken);

    // Generate new access token
    const accessToken = generateAccessToken({
      id: decoded.id,
      email: decoded.email,
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken,
      },
      message: 'Token refreshed successfully',
    });
  } catch (error: any) {
    logger.error('Token refresh error:', { error: error.message });
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired refresh token',
      },
    });
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default router;
