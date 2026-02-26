import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import healthRouter from './routes/health.js';
import buildRouter from './routes/build.js';
import { errorHandler } from './middleware/errorHandler.js';
import { manifestRateLimiter } from './middleware/rateLimiter.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────

app.set('trust proxy', 1); // Trust first Nginx proxy for rate limiting

app.use(
  helmet({
    // Allow cross-origin resource requests (needed for APK downloads)
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    // Content-Security-Policy — backend serves JSON + APK files, not HTML,
    // but CSP still protects any error pages from reflected-content attacks.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },

    // HTTP Strict Transport Security — tell browsers to always use HTTPS
    hsts: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
    },

    // Prevent embedding in iframes
    frameguard: { action: 'deny' },

    // Prevent MIME sniffing
    noSniff: true,

    // Referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

// ─── General middleware ───────────────────────────────────────────────────────

app.use(compression());
app.use(express.json({ limit: '16kb' })); // Small limit — we only receive JSON options

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api', healthRouter);
app.use('/api/build', buildRouter);

// Also expose manifest fetch as a passthrough so the frontend can avoid CORS issues.
// Rate-limited to prevent SSRF scanning. SSRF IP blocking is enforced inside
// manifestFetcher.ts (fetchWithTimeout checks isPrivateHostname before every fetch).
app.get('/api/manifest', manifestRateLimiter, async (req, res, next): Promise<void> => {
  const { url } = req.query;
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    res.status(400).json({ error: 'url query param required and must be HTTPS' });
    return;
  }
  try {
    const { fetchManifest, deriveOptions } = await import('./services/manifestFetcher.js');
    const manifest = await fetchManifest(url);
    const defaults = deriveOptions(manifest, url);
    res.json({ manifest, defaults });
  } catch (err) {
    // Surface SSRF blocks as 403, not 500
    if (err instanceof Error && (err as Error & { ssrfBlocked?: boolean }).ssrfBlocked) {
      res.status(403).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ─── Error handling ───────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[pwa-maker] backend listening on port ${PORT}`);
  console.log(`[pwa-maker] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);
  console.log(`[pwa-maker] ANDROID_HOME=${process.env.ANDROID_HOME ?? 'NOT SET'}`);
  console.log(`[pwa-maker] JAVA_HOME=${process.env.JAVA_HOME ?? 'NOT SET'}`);
});

export default app;
