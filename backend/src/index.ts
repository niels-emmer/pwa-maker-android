import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import healthRouter from './routes/health.js';
import buildRouter from './routes/build.js';
import { errorHandler } from './middleware/errorHandler.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────

app.set('trust proxy', 1); // Trust first Nginx proxy for rate limiting

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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

// Also expose manifest fetch as a passthrough so the frontend can avoid CORS issues
app.get('/api/manifest', async (req, res, next): Promise<void> => {
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
