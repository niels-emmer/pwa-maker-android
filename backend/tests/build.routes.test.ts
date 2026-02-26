import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

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

  it('returns 202 with buildId for valid payload', async () => {
    const res = await request(app).post('/api/build').send(validPayload);
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('buildId');
    expect(typeof res.body.buildId).toBe('string');
  });

  it('returns 400 for missing pwaUrl', async () => {
    const { pwaUrl: _, ...withoutUrl } = validPayload;
    const res = await request(app).post('/api/build').send(withoutUrl);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for HTTP (non-HTTPS) pwaUrl in production', async () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, pwaUrl: 'http://example.com' });
    process.env.NODE_ENV = old;
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid packageId', async () => {
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, packageId: 'not-valid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid hex themeColor', async () => {
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, themeColor: 'red' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for appName exceeding 50 chars', async () => {
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, appName: 'A'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid display mode', async () => {
    const res = await request(app)
      .post('/api/build')
      .send({ ...validPayload, display: 'browser' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when at concurrent build limit', async () => {
    const { countRunningBuilds } = await import('../src/services/buildStore.js');
    vi.mocked(countRunningBuilds).mockReturnValueOnce(999);
    const res = await request(app).post('/api/build').send(validPayload);
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
