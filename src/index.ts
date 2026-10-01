import express, { Application, Request, Response } from "express";
import https from "https";
import fs from "fs";
import path from "path";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import helmet from "helmet";
import connectDB from "./config/database";
import { apiLimiter } from "./middleware/security";
import logger from "./config/logger";

// Import models to register schemas
import "./models/User";
import "./models/Doctor";
import "./models/District";
import "./models/Patient";
import "./models/Prescription";
import "./models/Product";
import "./models/Order";
import "./models/DistrictProduct";
import "./models/City";
import "./models/Distributor";
import "./models/Banner";
import "./models/Inventory";
import "./models/Coupon";
import "./models/Notification";

// Import routes
import authRoutes from "./routes/auth";
import adminAuthRoutes from "./routes/adminAuth";
import doctorRoutes from "./routes/doctor";
import patientRoutes from "./routes/patient";
import prescriptionRoutes from "./routes/prescription";
import productRoutes from "./routes/product";
import orderRoutes from "./routes/order";
import webhookRoutes from "./routes/webhook";
import cityRoutes from "./routes/city";
import districtCityRoutes from "./routes/districtCity";
import distributorAuthRoutes from "./routes/distributorAuth";
import distributorRoutes from "./routes/distributor";
import distributorOrderRoutes from "./routes/distributorOrder";
import bannerRoutes from "./routes/banner";
import adminPrescriptionRoutes from "./routes/adminPrescription";
import inventoryRoutes from "./routes/inventory";
import couponRoutes from "./routes/coupon";
import orderExtrasRoutes from "./routes/orderExtras";
import ratingRoutes from "./routes/rating";
import outletPerformanceRoutes from "./routes/outletPerformance";
import reportsRoutes from "./routes/reports";
import riderRoutes from "./routes/rider";

// Load environment variables
dotenv.config({ quiet: true });

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 443;
const HTTP_PORT = process.env.HTTP_PORT || 80;

// Trust proxy - important for rate limiting behind proxies
app.set("trust proxy", 1);

// CORS - must be first
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    credentials: true,
  }),
);

// Compress responses (JSON report payloads in particular)
app.use(compression());

// Body parsers - must come early
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Security Middleware - simplified helmet config to avoid conflicts
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false,
  }),
);

// Rate limiting for API routes (very lenient, skips in development)
app.use("/api/", apiLimiter);

// Connect to MongoDB
connectDB();

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Dast E Yaar API is running",
    version: "1.0.0",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth", adminAuthRoutes); // Admin/KAM auth routes
app.use("/api/v1/auth", distributorAuthRoutes); // Distributor auth routes
app.use("/api/v1/doctors", doctorRoutes);
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/prescriptions", prescriptionRoutes);
app.use("/api/v1/products", productRoutes);
// orderExtrasRoutes must mount before orderRoutes: both share the "/api/v1/orders"
// prefix and orderRoutes' GET "/:id" would otherwise shadow orderExtras' literal
// top-level routes (e.g. GET "/quick-tags") since Express dispatches to whichever
// router matches first.
app.use("/api/v1/orders", orderExtrasRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/cities", cityRoutes);
app.use("/api/v1/districts", districtCityRoutes);
app.use("/api/v1/distributors", distributorRoutes);
app.use("/api/v1/distributor/orders", distributorOrderRoutes);
app.use("/api/v1/banners", bannerRoutes);
app.use("/api/v1/admin/prescriptions", adminPrescriptionRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/coupons", couponRoutes);
app.use("/api/v1/ratings", ratingRoutes);
app.use("/api/v1/outlet-performance", outletPerformanceRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/riders", riderRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error("Server error:", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || "SERVER_ERROR",
      message: err.message || "Internal server error",
    },
  });
});

// SSL Configuration
const useHTTPS = process.env.USE_HTTPS === "true";

if (useHTTPS) {
  try {
    // Load SSL certificates
    const privateKey = fs.readFileSync(
      path.join(__dirname, "../server.key"),
      "utf8",
    );
    const certificate = fs.readFileSync(
      path.join(__dirname, "../dasteyaar_pk.crt"),
      "utf8",
    );
    const ca = fs.readFileSync(
      path.join(__dirname, "../dasteyaar_pk.ca-bundle"),
      "utf8",
    );

    const credentials = {
      key: privateKey,
      cert: certificate,
      ca: ca,
    };

    // Create HTTPS server
    const httpsServer = https.createServer(credentials, app);

    httpsServer.listen(PORT, () => {
      logger.info(`🔒 HTTPS Server running on port ${PORT}`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // Optional: Create HTTP server that redirects to HTTPS
    const httpApp = express();
    httpApp.use((req, res) => {
      res.redirect(`https://${req.headers.host}${req.url}`);
    });

    httpApp.listen(HTTP_PORT, () => {
      logger.info(`🔄 HTTP redirect server running on port ${HTTP_PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start HTTPS server:", error);
    logger.info("Falling back to HTTP server");

    // Fallback to HTTP
    app.listen(PORT, () => {
      logger.info(`🚀 HTTP Server running on port ${PORT}`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  }
} else {
  // Start HTTP server (development mode)
  app.listen(PORT, () => {
    logger.info(`🚀 HTTP Server running on port ${PORT}`);
    logger.info(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

export default app;
