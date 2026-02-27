import rateLimit from 'express-rate-limit';

const perHour = parseInt(process.env.BUILD_RATE_LIMIT_PER_HOUR ?? '10', 10) || 10;

/**
 * Sliding-window rate limiter for the /api/build POST endpoint.
 * Limits each IP to BUILD_RATE_LIMIT_PER_HOUR requests per hour.
 */
export const buildRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: perHour,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: `Rate limit exceeded. Maximum ${perHour} build requests per hour per IP address.`,
  },
  // Trust X-Forwarded-For from Nginx proxy (first hop only)
  skip: () => false,
});

/**
 * Rate limiter for the /api/manifest GET endpoint.
 * More permissive than the build limiter (manifest fetches are cheap),
 * but still prevents SSRF probing and brute-force scanning.
 * 30 requests per IP per minute.
 */
export const manifestRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many manifest fetch requests. Maximum 30 per minute per IP address.',
  },
  skip: () => false,
});

/**
 * Rate limiter for the /api/token GET endpoint.
 * Prevents bots from harvesting tokens at scale.
 * 20 requests per IP per 10 minutes (invisible to normal users who fetch once per build).
 */
export const tokenRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many token requests. Please wait before trying again.',
  },
  skip: () => false,
});
