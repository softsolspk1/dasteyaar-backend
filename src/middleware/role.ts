import { Request, Response, NextFunction } from 'express';
import { AdminAuthRequest } from './adminAuth';

/**
 * Middleware to check if user has required role(s)
 * @param allowedRoles - Array of allowed roles
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
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

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        },
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is Super Admin
 */
export const requireSuperAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  requireRole(['super_admin'])(req, res, next);
};

/**
 * Middleware to check if user is KAM or Super Admin
 */
export const requireKAMOrAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  requireRole(['super_admin', 'kam'])(req, res, next);
};

/**
 * Middleware to check if user is Director or Super Admin (coupon approval authority)
 */
export const requireDirector = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  requireRole(['super_admin', 'director'])(req, res, next);
};

/**
 * Middleware to check if user is Sales Manager or Super Admin (inventory/outlet oversight)
 */
export const requireManagerOrAdmin = (req: AdminAuthRequest, res: Response, next: NextFunction): void => {
  requireRole(['super_admin', 'sales_manager'])(req, res, next);
};
