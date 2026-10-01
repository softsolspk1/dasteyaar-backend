import crypto from 'crypto';

/**
 * Verify Shopify webhook HMAC signature
 * @param body - Raw request body (string or buffer)
 * @param hmacHeader - HMAC signature from X-Shopify-Hmac-SHA256 header
 * @returns boolean - True if signature is valid
 */
export const verifyShopifyWebhook = (
  body: string | Buffer,
  hmacHeader: string
): boolean => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error('SHOPIFY_WEBHOOK_SECRET not configured');
  }

  // Generate HMAC
  const bodyString = typeof body === 'string' ? body : body.toString('utf8');
  const hash = crypto
    .createHmac('sha256', secret)
    .update(bodyString, 'utf8')
    .digest('base64');

  // Compare using timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  );
};

/**
 * Middleware to verify Shopify webhook signatures
 */
export const verifyWebhookMiddleware = (
  req: any,
  res: any,
  next: any
) => {
  const hmacHeader = req.get('X-Shopify-Hmac-SHA256');

  if (!hmacHeader) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_HMAC',
        message: 'Missing HMAC signature'
      }
    });
  }

  try {
    // Get raw body (must be stored by body parser)
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const isValid = verifyShopifyWebhook(rawBody, hmacHeader);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_HMAC',
          message: 'Invalid HMAC signature'
        }
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: 'Failed to verify webhook signature'
      }
    });
  }
};
