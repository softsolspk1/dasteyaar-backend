import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import Doctor from '../models/Doctor';

export interface AuthRequest extends Request {
  doctor?: {
    id: string;
    email: string;
    district_id: string;
    team_id?: string;
  };
}

export const authenticateDoctor = async (
  req: AuthRequest,
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
          message: 'No token provided',
        },
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    // Verify doctor exists and is active
    const doctor = await Doctor.findById(decoded.id).select('-password');
    if (!doctor || doctor.status !== 'active') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or inactive account',
        },
      });
      return;
    }

    req.doctor = {
      id: String(doctor._id),
      email: doctor.email,
      district_id: String(doctor.district_id),
      team_id: doctor.team_id ? String(doctor.team_id) : undefined,
    };

    next();
  } catch (error: any) {
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
