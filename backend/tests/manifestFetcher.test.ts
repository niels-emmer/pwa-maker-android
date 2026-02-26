import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  derivePackageId,
  selectBestIcon,
  selectMaskableIcon,
  deriveOptions,
} from '../src/services/manifestFetcher.js';
import type { WebManifestIcon } from '../src/types.js';

// ─── derivePackageId ─────────────────────────────────────────────────────────

describe('derivePackageId', () => {
  it('reverses hostname segments', () => {
    expect(derivePackageId('https://my-app.example.com')).toBe('com.example.myapp');
  });

  it('handles simple two-segment hostname by appending "app"', () => {
    expect(derivePackageId('https://example.com')).toBe('com.example.app');
  });

  it('strips invalid characters', () => {
    expect(derivePackageId('https://my-app.example.com')).toMatch(
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/
    );
  });

  it('handles single segment by appending "app" twice', () => {
    const id = derivePackageId('https://localhost');
    expect(id.split('.').length).toBeGreaterThanOrEqual(3);
  });

  it('prefixes numeric-start segments with "a"', () => {
    const id = derivePackageId('https://123abc.example.com');
    expect(id).not.toMatch(/\.\d/);
  });
});

// ─── selectBestIcon ──────────────────────────────────────────────────────────

describe('selectBestIcon', () => {
  const base = 'https://example.com';

  it('returns null for empty icon list', () => {
    expect(selectBestIcon([], base)).toBeNull();
  });

  it('selects the largest icon', () => {
    const icons: WebManifestIcon[] = [
      { src: '/icon-192.png', sizes: '192x192' },
      { src: '/icon-512.png', sizes: '512x512' },
      { src: '/icon-48.png', sizes: '48x48' },
    ];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icon-512.png');
  });

  it('skips maskable icons', () => {
    const icons: WebManifestIcon[] = [
      { src: '/maskable.png', sizes: '1024x1024', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512' },
    ];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icon-512.png');
  });

  it('resolves relative URLs', () => {
    const icons: WebManifestIcon[] = [{ src: '/icons/app.png', sizes: '512x512' }];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icons/app.png');
  });
});

// ─── selectMaskableIcon ──────────────────────────────────────────────────────

describe('selectMaskableIcon', () => {
  const base = 'https://example.com';

  it('returns null when no maskable icons exist', () => {
    const icons: WebManifestIcon[] = [{ src: '/icon.png', sizes: '512x512' }];
    expect(selectMaskableIcon(icons, base)).toBeNull();
  });

  it('returns the maskable icon URL', () => {
    const icons: WebManifestIcon[] = [
      { src: '/icon.png', sizes: '512x512' },
      { src: '/maskable.png', sizes: '512x512', purpose: 'maskable' },
    ];
    expect(selectMaskableIcon(icons, base)).toBe('https://example.com/maskable.png');
  });
});

// ─── deriveOptions ───────────────────────────────────────────────────────────

describe('deriveOptions', () => {
  it('uses manifest name', () => {
    const result = deriveOptions({ name: 'My PWA' }, 'https://example.com');
    expect(result.appName).toBe('My PWA');
  });

  it('truncates shortName to 12 chars', () => {
    const result = deriveOptions(
      { name: 'A Very Long App Name Here' },
      'https://example.com'
    );
    expect((result.shortName ?? '').length).toBeLessThanOrEqual(12);
  });

  it('falls back to default theme color', () => {
    const result = deriveOptions({}, 'https://example.com');
    expect(result.themeColor).toBe('#000000');
  });

  it('normalises unknown display mode to standalone', () => {
    const result = deriveOptions({ display: 'browser' }, 'https://example.com');
    expect(result.display).toBe('standalone');
  });

  it('normalises unknown orientation to default', () => {
    const result = deriveOptions({ orientation: 'any' }, 'https://example.com');
    expect(result.orientation).toBe('default');
  });

  it('keeps valid display mode', () => {
    const result = deriveOptions({ display: 'fullscreen' }, 'https://example.com');
    expect(result.display).toBe('fullscreen');
  });
});

// ─── fetchManifest (network-dependent, mocked) ───────────────────────────────

describe('fetchManifest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and parses a direct manifest JSON URL', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');

    const mockManifest = { name: 'Test App', icons: [] };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockManifest,
      text: async () => JSON.stringify(mockManifest),
    } as unknown as Response);

    const result = await fetchManifest('https://example.com/manifest.json');
    expect(result.name).toBe('Test App');
  });

  it('extracts manifest URL from HTML page', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');

    const mockManifest = { name: 'HTML App', icons: [] };
    const htmlResponse = {
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () =>
        '<html><head><link rel="manifest" href="/app.webmanifest"></head></html>',
    } as unknown as Response;
    const manifestResponse = {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockManifest,
    } as unknown as Response;

    vi.mocked(fetch)
      .mockResolvedValueOnce(htmlResponse)
      .mockResolvedValueOnce(manifestResponse);

    const result = await fetchManifest('https://example.com');
    expect(result.name).toBe('HTML App');
  });

  it('throws when manifest link is not found', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<html><head></head></html>',
    } as unknown as Response);

    await expect(fetchManifest('https://example.com')).rejects.toThrow(
      'No <link rel="manifest">'
    );
  });

  it('throws on non-OK response', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => 'text/html' },
    } as unknown as Response);

    await expect(fetchManifest('https://example.com')).rejects.toThrow('404');
  });
});
