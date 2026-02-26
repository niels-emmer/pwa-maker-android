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
