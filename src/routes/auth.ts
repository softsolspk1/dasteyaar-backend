import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import Doctor from "../models/Doctor";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { validate } from "../middleware/validate";
import { loginSchema, refreshTokenSchema } from "../validators/auth.validator";
import { authLimiter } from "../middleware/security";

const router = express.Router();

// Doctor Login
router.post(
  "/doctor/login",
  authLimiter,
  validate(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Find doctor
      const doctor = await Doctor.findOne({ email: email.toLowerCase() });
      if (!doctor) {
        res.status(401).json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        });
        return;
      }

      // Check if doctor is active
      if (doctor.status !== "active") {
        res.status(403).json({
          success: false,
          error: {
            code: "ACCOUNT_INACTIVE",
            message: "Your account is inactive. Please contact support.",
          },
        });
        return;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, doctor.password);
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        });
        return;
      }

      // Generate tokens
      const accessToken = generateAccessToken({
        id: String(doctor._id),
        email: doctor.email,
      });

      const refreshToken = generateRefreshToken({
        id: String(doctor._id),
        email: doctor.email,
      });

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          doctor: {
            id: doctor._id,
            email: doctor.email,
            name: doctor.name,
            phone: doctor.phone,
            district_id: doctor.district_id,
            specialty: doctor.specialty,
          },
        },
        message: "Login successful",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "An error occurred during login",
        },
      });
    }
  },
);

// Refresh Token
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      const decoded = verifyRefreshToken(refreshToken);

      // Generate new access token
      const accessToken = generateAccessToken({
        id: decoded.id,
        email: decoded.email,
      });

      res.json({
        success: true,
        data: {
          accessToken,
        },
        message: "Token refreshed successfully",
      });
    } catch (error: any) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      ) {
        res.status(401).json({
          success: false,
          error: {
            code: "INVALID_REFRESH_TOKEN",
            message: "Invalid or expired refresh token",
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "An error occurred during token refresh",
        },
      });
    }
  },
);

// Logout (optional - mainly for client-side token clearing)
router.post("/logout", (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: "Logout successful",
  });
});

export default router;
