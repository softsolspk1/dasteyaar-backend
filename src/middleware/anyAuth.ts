import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import Doctor from "../models/Doctor";
import Distributor from "../models/Distributor";
import User from "../models/User";
import logger from "../config/logger";

export interface Actor {
  id: string;
  name: string;
  role: string; // 'doctor' | 'distributor' | 'super_admin' | 'kam' | 'director' | 'sales_manager'
}

export interface AnyAuthRequest extends Request {
  actor?: Actor;
}

/**
 * Authenticates a Bearer token against any of the three identity collections
 * (Doctor, Distributor, User) and normalizes the caller into req.actor.
 * Used by Order sub-resources (remarks, prescription attachments, delivery,
 * outlet performance) which are legitimately writable/readable by multiple roles.
 */
export const authenticateAny = async (req: AnyAuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Access token is required" } });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    const [doctor, distributor, user] = await Promise.all([
      Doctor.findById(decoded.id).select("name status").lean(),
      Distributor.findById(decoded.id).select("name status").lean(),
      User.findById(decoded.id).select("name role status").lean(),
    ]);

    if (doctor && doctor.status === "active") {
      req.actor = { id: String(doctor._id), name: doctor.name, role: "doctor" };
    } else if (distributor && distributor.status === "active") {
      req.actor = { id: String(distributor._id), name: distributor.name, role: "distributor" };
    } else if (user && user.status === "active") {
      req.actor = { id: String(user._id), name: user.name, role: user.role };
    } else {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or inactive account" } });
      return;
    }

    next();
  } catch (error: any) {
    logger.warn("authenticateAny failed:", { error: error.message });
    res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
};

export const isInternalRole = (role: string): boolean =>
  ["super_admin", "kam", "director", "sales_manager"].includes(role);
