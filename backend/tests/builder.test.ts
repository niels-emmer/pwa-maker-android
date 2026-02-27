import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BuildOptions } from '../src/types.js';

// ─── All heavy I/O is mocked ─────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  chmod: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue(['app-release-unsigned.apk']),
}));

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));

vi.mock('@bubblewrap/core', () => ({
  TwaManifest: vi.fn().mockImplementation((data: unknown) => data),
  TwaGenerator: vi.fn().mockImplementation(() => ({
    createTwaProject: vi.fn().mockResolvedValue(undefined),
  })),
  ConsoleLog: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock @resvg/resvg-js so SVG conversion works without native binaries in CI
vi.mock('@resvg/resvg-js', () => ({
  Resvg: vi.fn().mockImplementation(() => ({
    render: vi.fn().mockReturnValue({
      asPng: vi.fn().mockReturnValue(new Uint8Array([137, 80, 78, 71])), // PNG magic bytes
    }),
  })),
}));

const mockOptions: BuildOptions = {
  pwaUrl: 'https://example.com',
  appName: 'Test App',
  shortName: 'TestApp',
  packageId: 'com.example.testapp',
  display: 'standalone',
  orientation: 'portrait',
  themeColor: '#000000',
  backgroundColor: '#ffffff',
  iconUrl: 'https://example.com/icon.png',
  maskableIconUrl: null,
};

// ─── isSvgUrl ────────────────────────────────────────────────────────────────

describe('isSvgUrl', () => {
  it('returns true for .svg URLs', async () => {
    const { isSvgUrl } = await import('../src/services/builder.js');
    expect(isSvgUrl('https://example.com/icon-512.svg')).toBe(true);
  });

  it('returns false for .png URLs', async () => {
    const { isSvgUrl } = await import('../src/services/builder.js');
    expect(isSvgUrl('https://example.com/icon-512.png')).toBe(false);
  });

  it('returns false for invalid URLs', async () => {
    const { isSvgUrl } = await import('../src/services/builder.js');
    expect(isSvgUrl('not-a-url')).toBe(false);
  });

  it('is case-insensitive', async () => {
    const { isSvgUrl } = await import('../src/services/builder.js');
    expect(isSvgUrl('https://example.com/icon.SVG')).toBe(true);
  });
});

// ─── buildApk ────────────────────────────────────────────────────────────────

describe('buildApk', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('calls onProgress and resolves with apkPath', async () => {
    const { buildApk } = await import('../src/services/builder.js');
    const messages: string[] = [];

    const result = await buildApk(mockOptions, (msg) => messages.push(msg));

    expect(result.apkPath).toContain('.apk');
    expect(result.buildDir).toBeTruthy();
    expect(messages.length).toBeGreaterThan(0);
  });

  it('constructs TwaManifest with correct packageId', async () => {
    const { TwaManifest } = await import('@bubblewrap/core');
    const { buildApk } = await import('../src/services/builder.js');

    await buildApk(mockOptions, vi.fn());

    expect(TwaManifest).toHaveBeenCalledWith(
      expect.objectContaining({ packageId: 'com.example.testapp' })
    );
  });

  it('uses pwaUrl host as TWA host', async () => {
    const { TwaManifest } = await import('@bubblewrap/core');
    const { buildApk } = await import('../src/services/builder.js');

    await buildApk(mockOptions, vi.fn());

    expect(TwaManifest).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'example.com' })
    );
  });

  it('cleans up on build failure', async () => {
    const { execa } = await import('execa');
    const { rm } = await import('fs/promises');
    const { buildApk } = await import('../src/services/builder.js');

    // Make gradle fail
    vi.mocked(execa).mockRejectedValueOnce(new Error('gradle failed'));

    await expect(buildApk(mockOptions, vi.fn())).rejects.toThrow('gradle failed');
    expect(rm).toHaveBeenCalledWith(expect.stringContaining('pwa-maker'), {
      recursive: true,
      force: true,
    });
  });

  it('converts SVG iconUrl to a temporary PNG URL before passing to TwaManifest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer,
    }));

    const { TwaManifest } = await import('@bubblewrap/core');
    const { buildApk } = await import('../src/services/builder.js');

    const svgOptions: BuildOptions = { ...mockOptions, iconUrl: 'https://example.com/icon.svg' };
    await buildApk(svgOptions, vi.fn());

    // TwaManifest must NOT receive the original .svg URL
    expect(TwaManifest).toHaveBeenCalledWith(
      expect.objectContaining({ iconUrl: expect.not.stringContaining('.svg') })
    );

    vi.unstubAllGlobals();
  });
});
