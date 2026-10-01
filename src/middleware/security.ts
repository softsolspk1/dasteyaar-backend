import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 * 1000 requests per hour per IP (very lenient for development)
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Limit each IP to 1000 requests per hour
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later'
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: () => process.env.NODE_ENV === 'development', // Skip in development
});

/**
 * Lenient rate limiter for authentication routes
 * 100 login attempts per day
 */
export const authLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours (1 day)
  max: 100, // Limit each IP to 100 login requests per day
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many login attempts, please try again tomorrow'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  skip: () => process.env.NODE_ENV === 'development', // Skip in development
});

/**
 * Rate limiter for file uploads
 * 200 uploads per hour (very lenient)
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // Limit each IP to 200 uploads per hour
  message: {
    success: false,
    error: {
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      message: 'Too many file uploads, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development', // Skip in development
});

/**
 * Rate limiter for creating prescriptions
 * 500 prescriptions per hour (very lenient for development)
 */
export const prescriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // Limit each IP to 500 prescriptions per hour
  message: {
    success: false,
    error: {
      code: 'PRESCRIPTION_RATE_LIMIT_EXCEEDED',
      message: 'Too many prescriptions created, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development', // Skip in development
});
