import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import tokenRouter, { generateToken, verifyToken } from '../src/routes/token.js';

// ─── Minimal test app ─────────────────────────────────────────────────────────
// We create a standalone Express app so this test file does NOT import index.ts.
// Both this file and build.routes.test.ts run in parallel vitest forks — if both
// imported index.ts they would both try to listen on port 3001 and one would crash.
const app = express();
app.use(express.json());
app.use('/api/token', tokenRouter);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/token', () => {
  it('returns 200 with a token object', async () => {
    const res = await request(app).get('/api/token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('token has the expected format: <timestamp>.<hmac_hex>', async () => {
    const res = await request(app).get('/api/token');
    const token: string = res.body.token;

    const dot = token.lastIndexOf('.');
    expect(dot).toBeGreaterThan(0);

    const ts = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    // Timestamp is a valid integer
    expect(Number.isInteger(Number(ts))).toBe(true);

    // HMAC-SHA256 hex is 64 chars
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('token timestamp is within the last second', async () => {
    const before = Date.now();
    const res = await request(app).get('/api/token');
    const after = Date.now();

    const ts = Number(res.body.token.split('.')[0]);
    expect(ts).toBeGreaterThanOrEqual(before - 100);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });

  it('generated token passes verifyToken', async () => {
    const res = await request(app).get('/api/token');
    expect(verifyToken(res.body.token as string)).toBe(true);
  });
});

describe('verifyToken', () => {
  it('accepts a freshly generated token', () => {
    expect(verifyToken(generateToken())).toBe(true);
  });

  it('rejects a token with a tampered signature', () => {
    const token = generateToken();
    const ts = token.slice(0, token.lastIndexOf('.'));
    const tampered = `${ts}.${'0'.repeat(64)}`; // valid length but wrong HMAC
    expect(verifyToken(tampered)).toBe(false);
  });

  it('rejects an expired token (>10 min old)', () => {
    const pastTs = String(Date.now() - 11 * 60 * 1000);
    // Signature doesn't matter — TTL check fires before HMAC check
    const expired = `${pastTs}.${'a'.repeat(64)}`;
    expect(verifyToken(expired)).toBe(false);
  });

  it('rejects a token from more than 1 minute in the future', () => {
    const futureTs = String(Date.now() + 5 * 60 * 1000);
    const future = `${futureTs}.${'a'.repeat(64)}`;
    expect(verifyToken(future)).toBe(false);
  });

  it('rejects a token without a dot separator', () => {
    expect(verifyToken('nodotintoken')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(verifyToken('')).toBe(false);
  });

  it('rejects a token with wrong HMAC length (padding attack guard)', () => {
    const token = generateToken();
    const ts = token.slice(0, token.lastIndexOf('.'));
    const wrongLength = `${ts}.abc`; // too short
    expect(verifyToken(wrongLength)).toBe(false);
  });
});
