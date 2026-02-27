import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  derivePackageId,
  selectBestIcon,
  selectMaskableIcon,
  deriveOptions,
  isPrivateHostname,
  isSvgIcon,
} from '../src/services/manifestFetcher.js';
import type { WebManifestIcon } from '../src/types.js';

// ─── isPrivateHostname ────────────────────────────────────────────────────────

describe('isPrivateHostname', () => {
  it('blocks localhost', () => {
    expect(isPrivateHostname('localhost')).toBe(true);
  });

  it('blocks 127.0.0.1', () => {
    expect(isPrivateHostname('127.0.0.1')).toBe(true);
  });

  it('blocks 127.x.x.x range', () => {
    expect(isPrivateHostname('127.99.99.99')).toBe(true);
  });

  it('blocks 10.x.x.x', () => {
    expect(isPrivateHostname('10.0.0.1')).toBe(true);
  });

  it('blocks 192.168.x.x', () => {
    expect(isPrivateHostname('192.168.1.100')).toBe(true);
  });

  it('blocks 172.16.x.x (start of range)', () => {
    expect(isPrivateHostname('172.16.0.1')).toBe(true);
  });

  it('blocks 172.31.x.x (end of range)', () => {
    expect(isPrivateHostname('172.31.255.255')).toBe(true);
  });

  it('does not block 172.32.x.x (outside range)', () => {
    expect(isPrivateHostname('172.32.0.1')).toBe(false);
  });

  it('blocks 169.254.x.x (AWS/GCP metadata)', () => {
    expect(isPrivateHostname('169.254.169.254')).toBe(true);
  });

  it('blocks 0.x.x.x', () => {
    expect(isPrivateHostname('0.0.0.0')).toBe(true);
  });

  it('blocks IPv6 loopback ::1', () => {
    expect(isPrivateHostname('::1')).toBe(true);
  });

  it('blocks IPv6 loopback in brackets [::1]', () => {
    expect(isPrivateHostname('[::1]')).toBe(true);
  });

  it('blocks IPv6 fc00:: range', () => {
    expect(isPrivateHostname('fc00::1')).toBe(true);
  });

  it('blocks IPv6 fd00:: range', () => {
    expect(isPrivateHostname('fd12:3456:789a::1')).toBe(true);
  });

  it('blocks metadata.google.internal', () => {
    expect(isPrivateHostname('metadata.google.internal')).toBe(true);
  });

  it('allows public IPv4', () => {
    expect(isPrivateHostname('93.184.216.34')).toBe(false);
  });

  it('allows public domain names', () => {
    expect(isPrivateHostname('example.com')).toBe(false);
    expect(isPrivateHostname('pwa.macjuu.com')).toBe(false);
  });
});

// ─── SSRF blocking in fetchManifest ──────────────────────────────────────────

describe('fetchManifest SSRF blocking', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws on localhost URL', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');
    await expect(fetchManifest('https://localhost/manifest.json')).rejects.toThrow(
      /private\/loopback/i
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('throws on 127.0.0.1', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');
    await expect(fetchManifest('https://127.0.0.1/manifest.json')).rejects.toThrow(
      /private\/loopback/i
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('throws on 169.254.169.254 (cloud metadata)', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');
    await expect(fetchManifest('https://169.254.169.254/')).rejects.toThrow(
      /private\/loopback/i
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('throws on 192.168.x.x', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');
    await expect(fetchManifest('https://192.168.1.1/manifest.json')).rejects.toThrow(
      /private\/loopback/i
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('throws on IPv6 loopback [::1]', async () => {
    const { fetchManifest } = await import('../src/services/manifestFetcher.js');
    await expect(fetchManifest('https://[::1]/manifest.json')).rejects.toThrow(
      /private\/loopback/i
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── icon HTTPS enforcement ───────────────────────────────────────────────────

describe('selectBestIcon HTTPS enforcement', () => {
  const base = 'https://example.com';

  it('skips icons that resolve to http://', () => {
    const icons = [{ src: 'http://example.com/icon.png', sizes: '512x512' }];
    expect(selectBestIcon(icons, base)).toBeNull();
  });

  it('returns the icon when it resolves to https://', () => {
    const icons = [{ src: '/icon-512.png', sizes: '512x512' }];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icon-512.png');
  });

  it('falls through to the next https icon if first is http', () => {
    const icons = [
      { src: 'http://cdn.example.com/big.png', sizes: '1024x1024' },
      { src: '/icon-512.png', sizes: '512x512' },
    ];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icon-512.png');
  });
});

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

// ─── isSvgIcon ───────────────────────────────────────────────────────────────

describe('isSvgIcon', () => {
  it('detects by .svg extension', () => {
    expect(isSvgIcon({ src: '/icon-512.svg' })).toBe(true);
  });

  it('detects by image/svg+xml type', () => {
    expect(isSvgIcon({ src: '/icon', type: 'image/svg+xml' })).toBe(true);
  });

  it('returns false for PNG icons', () => {
    expect(isSvgIcon({ src: '/icon-512.png', type: 'image/png' })).toBe(false);
  });

  it('returns false when no extension or type', () => {
    expect(isSvgIcon({ src: '/icon' })).toBe(false);
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

  it('prefers PNG over SVG even when SVG is listed first or is larger', () => {
    const icons: WebManifestIcon[] = [
      { src: '/icon.svg', sizes: '1024x1024' },
      { src: '/icon-512.png', sizes: '512x512' },
    ];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icon-512.png');
  });

  it('falls back to SVG when no PNG is available', () => {
    const icons: WebManifestIcon[] = [
      { src: '/icon-512.svg', sizes: '512x512' },
    ];
    expect(selectBestIcon(icons, base)).toBe('https://example.com/icon-512.svg');
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
