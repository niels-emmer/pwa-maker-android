import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { generateToken } from '../src/routes/token.js';

// ─── Mock heavy dependencies before importing the app ────────────────────────

vi.mock('../src/services/builder.js', () => ({
  buildApk: vi.fn().mockResolvedValue({
    apkPath: '/tmp/pwa-maker-test/app/build/outputs/apk/release/app-release-signed.apk',
    buildDir: '/tmp/pwa-maker-test',
  }),
}));

vi.mock('../src/services/buildStore.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/buildStore.js')>();
  return {
    ...original,
    countRunningBuilds: vi.fn().mockReturnValue(0),
  };
});

// Mock the build rate limiter as a passthrough so it never fires 429 during tests.
// Rate-limiting behaviour is an integration concern tested separately; here we
// test the route's own logic (token validation, Zod parsing, concurrency cap).
vi.mock('../src/middleware/rateLimiter.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/middleware/rateLimiter.js')>();
  return {
    ...original,
    buildRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/build', () => {
  let app: import('express').Express;

  beforeEach(async () => {
    const mod = await import('../src/index.js');
    app = mod.default;
  });

  const validPayload = {
    pwaUrl: 'https://example.com',
    appName: 'Test App',
    shortName: 'TestApp',
    packageId: 'com.example.testapp',
    display: 'standalone',
    orientation: 'portrait',
    themeColor: '#1a1a2e',
    backgroundColor: '#16213e',
    iconUrl: 'https://example.com/icon-512.png',
    maskableIconUrl: null,
  };

  // Helper: add a fresh valid HMAC token to any payload
  const withToken = (payload: object) => ({ ...payload, buildToken: generateToken() });

  it('returns 202 with buildId for valid payload', async () => {
    const res = await request(app).post('/api/build').send(withToken(validPayload));
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('buildId');
    expect(typeof res.body.buildId).toBe('string');
  });

  it('returns 401 when buildToken is missing', async () => {
    const res = await request(app).post('/api/build').send(validPayload);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when buildToken is invalid', async () => {
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, buildToken: 'bad.token' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when buildToken has a tampered signature', async () => {
    const realToken = generateToken();
    const ts = realToken.slice(0, realToken.lastIndexOf('.'));
    const tampered = `${ts}.${'0'.repeat(64)}`;
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, buildToken: tampered });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing pwaUrl', async () => {
    const { pwaUrl: _, ...withoutUrl } = validPayload;
    const res = await request(app).post('/api/build').send(withToken(withoutUrl));
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for HTTP (non-HTTPS) pwaUrl in production', async () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app)
      .post('/api/build')
      .send(withToken({ ...validPayload, pwaUrl: 'http://example.com' }));
    process.env.NODE_ENV = old;
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid packageId', async () => {
    const res = await request(app)
      .post('/api/build')
      .send(withToken({ ...validPayload, packageId: 'not-valid' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid hex themeColor', async () => {
    const res = await request(app)
      .post('/api/build')
      .send(withToken({ ...validPayload, themeColor: 'red' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for appName exceeding 50 chars', async () => {
    const res = await request(app)
      .post('/api/build')
      .send(withToken({ ...validPayload, appName: 'A'.repeat(51) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid display mode', async () => {
    const res = await request(app)
      .post('/api/build')
      .send(withToken({ ...validPayload, display: 'browser' }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when at concurrent build limit', async () => {
    const { countRunningBuilds } = await import('../src/services/buildStore.js');
    vi.mocked(countRunningBuilds).mockReturnValueOnce(999);
    const res = await request(app).post('/api/build').send(withToken(validPayload));
    expect(res.status).toBe(503);
  });
});

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('includes Content-Security-Policy header', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('includes X-Frame-Options header set to DENY', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

describe('GET /api/build/:id/stream', () => {
  it('returns 404 for unknown build id', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await request(app).get('/api/build/nonexistent-id/stream');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/build/:id/download', () => {
  it('returns 404 for unknown build id', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await request(app).get('/api/build/nonexistent-id/download');
    expect(res.status).toBe(404);
  });
});
