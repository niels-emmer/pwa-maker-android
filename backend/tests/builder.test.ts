import { describe, it, expect, vi } from 'vitest';
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
  Log: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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

describe('buildApk', () => {
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
});
