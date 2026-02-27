import { Router } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { tokenRateLimiter } from '../middleware/rateLimiter.js';

// ─── Secret ───────────────────────────────────────────────────────────────────

let BUILD_TOKEN_SECRET: string = process.env.BUILD_TOKEN_SECRET ?? '';

if (!BUILD_TOKEN_SECRET) {
  BUILD_TOKEN_SECRET = randomBytes(32).toString('hex');
  console.warn(
    '[pwa-maker] WARNING: BUILD_TOKEN_SECRET is not set — using a random ephemeral secret.' +
      ' Tokens will be invalidated on every container restart.' +
      ' Set BUILD_TOKEN_SECRET in .env (run: openssl rand -hex 32).'
  );
}

// ─── Token helpers ────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a short-lived HMAC-SHA256 signed token.
 * Format: `${timestamp_ms}.${hmac_hex}`
 */
export function generateToken(): string {
  const ts = String(Date.now());
  const sig = createHmac('sha256', BUILD_TOKEN_SECRET).update(ts).digest('hex');
  return `${ts}.${sig}`;
}

/**
 * Verify a build token.
 * Returns true only if the HMAC is correct and the token was issued within TOKEN_TTL_MS.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyToken(token: string): boolean {
  if (typeof token !== 'string') return false;

  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;

  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Validate timestamp
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || !Number.isInteger(tsNum)) return false;
  if (Date.now() - tsNum > TOKEN_TTL_MS) return false;
  if (tsNum > Date.now() + 60_000) return false; // Reject tokens from the future (>1 min drift)

  // Compute expected HMAC
  const expected = createHmac('sha256', BUILD_TOKEN_SECRET).update(ts).digest('hex');

  // Lengths must match before calling timingSafeEqual (node requires same-length Buffers)
  if (sig.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/token
 * Returns a short-lived HMAC build token.
 * The frontend fetches this once immediately before submitting a build request.
 */
router.get('/', tokenRateLimiter, (_req, res): void => {
  res.json({ token: generateToken() });
});

export default router;
