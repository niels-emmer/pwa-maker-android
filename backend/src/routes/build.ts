import { Router, type Request, type Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { z } from 'zod';
import { buildRateLimiter } from '../middleware/rateLimiter.js';
import { verifyToken } from './token.js';
import {
  createBuild,
  getBuild,
  updateBuild,
  deleteBuild,
  emitProgress,
  addListener,
  removeListener,
  countRunningBuilds,
} from '../services/buildStore.js';
import { buildApk } from '../services/builder.js';
import type { BuildOptions, ProgressEvent } from '../types.js';

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_BUILDS ?? '3', 10) || 3;

const router = Router();

// ─── Input validation schema ──────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const PACKAGE_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;

const BuildOptionsSchema = z.object({
  pwaUrl: z
    .string()
    .url('pwaUrl must be a valid URL')
    .refine(
      (v) =>
        process.env.NODE_ENV === 'development'
          ? v.startsWith('http')
          : v.startsWith('https://'),
      { message: 'pwaUrl must use HTTPS' }
    ),
  appName: z
    .string()
    .min(1, 'appName is required')
    .max(50, 'appName must be 50 characters or fewer')
    .transform((v) => v.replace(/[<>&"'`]/g, '')),
  shortName: z
    .string()
    .min(1, 'shortName is required')
    .max(12, 'shortName must be 12 characters or fewer')
    .transform((v) => v.replace(/[<>&"'`]/g, '')),
  packageId: z
    .string()
    .regex(PACKAGE_ID, 'packageId must be a valid Android package name (e.g. com.example.app)'),
  display: z.enum(['standalone', 'fullscreen', 'minimal-ui']),
  orientation: z.enum(['portrait', 'landscape', 'default']),
  themeColor: z.string().regex(HEX_COLOR, 'themeColor must be a 6-digit hex color (e.g. #1a1a2e)'),
  backgroundColor: z
    .string()
    .regex(HEX_COLOR, 'backgroundColor must be a 6-digit hex color'),
  iconUrl: z.string().url('iconUrl must be a valid URL'),
  maskableIconUrl: z.string().url().nullable().optional(),
});

// ─── POST /api/build ──────────────────────────────────────────────────────────

router.post('/', buildRateLimiter, (req: Request, res: Response): void => {
  // ── Extract and validate HMAC build token (anti-bot, checked before Zod) ──
  const rawBody = req.body as Record<string, unknown>;
  const { buildToken, ...bodyWithoutToken } = rawBody;
  if (typeof buildToken !== 'string' || !verifyToken(buildToken)) {
    res.status(401).json({
      error: 'Missing or invalid build token. Please reload the page and try again.',
    });
    return;
  }

  const parsed = BuildOptionsSchema.safeParse(bodyWithoutToken);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  if (countRunningBuilds() >= MAX_CONCURRENT) {
    res.status(503).json({
      error: `Server is busy (${MAX_CONCURRENT} concurrent builds limit). Try again shortly.`,
    });
    return;
  }

  const options = parsed.data as BuildOptions;
  const state = createBuild(options);

  // Start build asynchronously
  void runBuild(state.id, options);

  res.status(202).json({ buildId: state.id });
});

// ─── GET /api/build/:id/stream (SSE) ─────────────────────────────────────────

router.get('/:id/stream', (req: Request, res: Response): void => {
  const { id } = req.params;
  const state = getBuild(id);

  if (!state) {
    res.status(404).json({ error: 'Build not found' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.flushHeaders();

  // `compression` middleware wraps res.write() in a gzip encoder that buffers
  // output until res.end(). Calling flush() after each write forces the encoder
  // to emit the compressed chunk immediately so SSE events stream in real-time.
  const flush = (): void => {
    (res as unknown as { flush?: () => void }).flush?.();
  };

  const send = (event: ProgressEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    flush();
  };

  // If already complete or errored, replay buffer and close
  if (state.status === 'complete' || state.status === 'error') {
    for (const event of state.eventBuffer) send(event);
    res.end();
    return;
  }

  const listener = (event: ProgressEvent): void => {
    send(event);
    if (event.type === 'complete' || event.type === 'error') {
      clearInterval(heartbeat);
      res.end();
      removeListener(id, listener);
    }
  };

  addListener(id, listener);

  // Keep-alive: emit an SSE comment every 15 s so nginx / load-balancers and
  // idle-connection timers don't close the stream while Gradle is running.
  // SSE comments (lines starting with ':') are ignored by the browser.
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
    flush();
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeListener(id, listener);
  });
});

// ─── GET /api/build/:id/download ─────────────────────────────────────────────

router.get('/:id/download', (req: Request, res: Response): void => {
  const { id } = req.params;
  const state = getBuild(id);

  if (!state) {
    res.status(404).json({ error: 'Build not found' });
    return;
  }

  if (state.status !== 'complete') {
    res.status(409).json({ error: `Build is not complete yet (status: ${state.status})` });
    return;
  }

  if (!state.apkPath || !existsSync(state.apkPath)) {
    res.status(410).json({ error: 'APK has expired or was already downloaded' });
    return;
  }

  const fileName = state.apkFileName ?? 'app.apk';
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const stream = createReadStream(state.apkPath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to read APK file' });
  });
  stream.pipe(res);

  // Schedule cleanup after download completes
  res.on('finish', () => {
    deleteBuild(id);
  });
});

// ─── Async build runner ───────────────────────────────────────────────────────

async function runBuild(id: string, options: BuildOptions): Promise<void> {
  updateBuild(id, { status: 'running' });
  emitProgress(id, { type: 'log', message: 'Build started…', percent: 5 });

  try {
    const result = await buildApk(options, (message, percent) => {
      emitProgress(id, { type: 'log', message, percent });
    });

    const safeAppName = options.appName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const apkFileName = `${safeAppName}.apk`;

    updateBuild(id, {
      status: 'complete',
      apkPath: result.apkPath,
      buildDir: result.buildDir,
      apkFileName,
      completedAt: Date.now(),
    });

    emitProgress(id, { type: 'complete', percent: 100 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown build error';
    updateBuild(id, { status: 'error', errorMessage: message });
    emitProgress(id, { type: 'error', message });
  }
}

export default router;
