import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import logger from '../config/logger';

export interface AdminAuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'super_admin' | 'kam' | 'director' | 'sales_manager';
    assigned_districts?: string[];
  };
}

/**
 * Middleware to authenticate admin/KAM users
 */
export const authenticateAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
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

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const decoded = verifyAccessToken(token);

    // Set user in request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: (decoded.role as 'super_admin' | 'kam' | 'director' | 'sales_manager') || 'kam',
      assigned_districts: decoded.assigned_districts || [],
    };

    next();
  } catch (error: any) {
    logger.warn('Admin authentication failed:', { error: error.message });
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      },
    });
  }
};

/**
 * Middleware to check if user is Super Admin
 */
export const requireSuperAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  if (req.user.role !== 'super_admin') {
    logger.warn('Unauthorized access attempt - Super Admin required', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Super Admin access required',
      },
    });
    return;
  }

  next();
};

/**
 * Middleware to check if user is KAM or Super Admin
 */
export const requireKAMOrAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  if (req.user.role !== 'super_admin' && req.user.role !== 'kam') {
    logger.warn('Unauthorized access attempt - KAM or Admin required', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'KAM or Super Admin access required',
      },
    });
    return;
  }

  next();
};
