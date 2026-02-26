import type { WebManifest, WebManifestIcon, BuildOptions } from '../types.js';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'PWAMakerAndroid/1.0 (+https://github.com/pwa-maker-android)';

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a possibly-relative URL against a base origin */
function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// ─── Manifest discovery ───────────────────────────────────────────────────────

/**
 * Given a URL (either a page URL or a direct manifest JSON URL),
 * fetch and return the parsed web manifest.
 */
export async function fetchManifest(rawUrl: string): Promise<WebManifest> {
  const url = rawUrl.trim();

  // Direct JSON manifest
  if (url.endsWith('.json') || url.includes('/manifest')) {
    return fetchManifestJson(url);
  }

  // HTML page — look for <link rel="manifest">
  const htmlRes = await fetchWithTimeout(url);
  if (!htmlRes.ok) {
    throw new Error(`Failed to fetch URL (${htmlRes.status}): ${url}`);
  }

  const contentType = htmlRes.headers.get('content-type') ?? '';

  // If the server returned JSON directly, parse it
  if (contentType.includes('application/json') || contentType.includes('manifest')) {
    const json: unknown = await htmlRes.json();
    return parseManifest(json);
  }

  const html = await htmlRes.text();
  const manifestUrl = extractManifestUrl(html, url);

  if (!manifestUrl) {
    throw new Error(
      'No <link rel="manifest"> found on the page. ' +
        'Provide the direct manifest JSON URL instead.'
    );
  }

  return fetchManifestJson(manifestUrl);
}

async function fetchManifestJson(url: string): Promise<WebManifest> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest (${res.status}): ${url}`);
  }
  const json: unknown = await res.json();
  return parseManifest(json);
}

function parseManifest(json: unknown): WebManifest {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Manifest is not a valid JSON object');
  }
  return json as WebManifest;
}

/** Extract <link rel="manifest" href="..."> from HTML */
function extractManifestUrl(html: string, pageUrl: string): string | null {
  const match = html.match(
    /<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)["']/i
  ) ?? html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']manifest["']/i
  );

  if (!match) return null;
  return resolveUrl(match[1], pageUrl);
}

// ─── Icon selection ───────────────────────────────────────────────────────────

/** Return the URL of the largest non-maskable icon (≥ 512px preferred) */
export function selectBestIcon(
  icons: WebManifestIcon[],
  baseUrl: string
): string | null {
  if (!icons || icons.length === 0) return null;

  const scored = icons
    .filter((i) => !i.purpose?.includes('maskable'))
    .map((i) => ({ icon: i, size: maxSize(i.sizes ?? '0x0') }))
    .sort((a, b) => b.size - a.size);

  const best = scored[0];
  if (!best) return null;
  return resolveUrl(best.icon.src, baseUrl);
}

/** Return the URL of the best maskable icon */
export function selectMaskableIcon(
  icons: WebManifestIcon[],
  baseUrl: string
): string | null {
  if (!icons || icons.length === 0) return null;

  const maskable = icons
    .filter((i) => i.purpose?.includes('maskable'))
    .map((i) => ({ icon: i, size: maxSize(i.sizes ?? '0x0') }))
    .sort((a, b) => b.size - a.size);

  const best = maskable[0];
  if (!best) return null;
  return resolveUrl(best.icon.src, baseUrl);
}

function maxSize(sizes: string): number {
  // sizes may be "512x512" or "48x48 72x72 96x96"
  return Math.max(
    ...sizes.split(' ').map((s) => {
      const [w] = s.toLowerCase().split('x');
      return parseInt(w ?? '0', 10) || 0;
    })
  );
}

// ─── Derive build options from manifest ──────────────────────────────────────

/**
 * Build a default BuildOptions object from a fetched manifest.
 * All fields can be overridden by the user.
 */
export function deriveOptions(manifest: WebManifest, pwaUrl: string): Partial<BuildOptions> {
  const origin = new URL(pwaUrl).origin;

  return {
    pwaUrl,
    appName: manifest.name ?? 'My App',
    shortName: (manifest.short_name ?? manifest.name ?? 'App').slice(0, 12),
    packageId: derivePackageId(pwaUrl),
    display: normaliseDisplay(manifest.display),
    orientation: normaliseOrientation(manifest.orientation),
    themeColor: manifest.theme_color ?? '#000000',
    backgroundColor: manifest.background_color ?? '#ffffff',
    iconUrl: selectBestIcon(manifest.icons ?? [], origin) ?? '',
    maskableIconUrl: selectMaskableIcon(manifest.icons ?? [], origin),
  };
}

function normaliseDisplay(value?: string): BuildOptions['display'] {
  if (value === 'fullscreen' || value === 'minimal-ui') return value;
  return 'standalone';
}

function normaliseOrientation(value?: string): BuildOptions['orientation'] {
  if (value === 'portrait' || value === 'landscape') return value;
  return 'default';
}

/**
 * Derive a valid Android package ID from a URL.
 * e.g. https://my-app.example.com → com.example.myapp
 */
export function derivePackageId(pwaUrl: string): string {
  const { hostname } = new URL(pwaUrl);
  const parts = hostname.split('.').filter(Boolean).reverse();

  // Clean each segment: keep only [a-z0-9_], ensure starts with letter
  const cleaned = parts.map((p) => {
    const s = p.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return /^[a-z]/.test(s) ? s : `a${s}`;
  });

  // Need at least 3 parts
  while (cleaned.length < 3) cleaned.push('app');

  return cleaned.join('.');
}
