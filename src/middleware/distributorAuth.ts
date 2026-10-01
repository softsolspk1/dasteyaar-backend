import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import Distributor from '../models/Distributor';
import logger from '../config/logger';

export interface DistributorAuthRequest extends Request {
  distributor?: {
    id: string;
    email: string;
    name: string;
    city_id: string;
  };
}

/**
 * Middleware to authenticate distributor users
 */
export const authenticateDistributor = async (
  req: DistributorAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is required',
        },
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    // Verify distributor exists and is active
    const distributor = await Distributor.findById(decoded.id).select('-password');

    if (!distributor) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Distributor account not found',
        },
      });
      return;
    }

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

    // Set distributor in request
    req.distributor = {
      id: String(distributor._id),
      email: distributor.email,
      name: distributor.name,
      city_id: String(distributor.city_id),
    };

    next();
  } catch (error: any) {
    logger.warn('Distributor authentication failed:', { error: error.message });

    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token',
        },
      });
      return;
    }

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Authentication failed',
      },
    });
  }
};
