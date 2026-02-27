import type { WebManifest, WebManifestIcon, BuildOptions } from '../types.js';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'PWAMakerAndroid/1.0 (+https://github.com/pwa-maker-android)';

// ─── SSRF protection ──────────────────────────────────────────────────────────

/**
 * Returns true if the hostname is a private/loopback/link-local address
 * that should never be fetched from a public-facing service.
 *
 * Blocked IPv4: 127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, 0.0.0.0/8
 * Blocked IPv6: ::1, fc00::/7 (includes fd00::/8), fe80::/10
 * Blocked names: localhost, metadata.google.internal
 */
export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();

  // Named loopback / cloud metadata hostnames
  if (h === 'localhost' || h === 'metadata.google.internal') return true;

  // Strip IPv6 brackets if present: [::1] → ::1
  const stripped = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;

  // IPv6 loopback
  if (stripped === '::1' || stripped === '0:0:0:0:0:0:0:1') return true;

  // IPv6 private ranges (fc00::/7 = fc00–fdff, fe80::/10 = fe80–febf)
  if (/^f[cd][0-9a-f]{2}:/i.test(stripped)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(stripped)) return true;

  // IPv4: must be exactly 4 dotted octets
  const ipv4Parts = stripped.split('.');
  if (ipv4Parts.length === 4) {
    const octets = ipv4Parts.map(Number);
    if (octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)) {
      const [a, b] = octets as [number, number, number, number];
      if (a === 127) return true;                       // 127.0.0.0/8 loopback
      if (a === 10) return true;                        // 10.0.0.0/8
      if (a === 0) return true;                         // 0.0.0.0/8
      if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local / AWS metadata
      if (a === 192 && b === 168) return true;          // 192.168.0.0/16
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    }
  }

  return false;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  // SSRF guard: block requests to private/loopback addresses
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error('Invalid URL');
  }

  if (isPrivateHostname(hostname)) {
    throw Object.assign(
      new Error(`Fetching from private/loopback addresses is not allowed: ${hostname}`),
      { ssrfBlocked: true }
    );
  }

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

/**
 * True if the icon is SVG (by MIME type or .svg extension).
 * Bubblewrap requires rasterised images; SVGs are handled by the builder via
 * @resvg/resvg-js conversion, but we prefer an existing PNG/WebP when available.
 */
export function isSvgIcon(icon: WebManifestIcon): boolean {
  return (
    icon.type === 'image/svg+xml' ||
    (icon.src?.toLowerCase().endsWith('.svg') ?? false)
  );
}

/**
 * Return the URL of the largest non-maskable icon (≥ 512px preferred).
 * Only returns HTTPS URLs — HTTP icons are skipped.
 * Raster icons (PNG/WebP) are ranked above SVGs of the same size; an SVG is
 * returned only when no raster option is available (the builder will convert it).
 */
export function selectBestIcon(
  icons: WebManifestIcon[],
  baseUrl: string
): string | null {
  if (!icons || icons.length === 0) return null;

  const scored = icons
    .filter((i) => !i.purpose?.includes('maskable'))
    .map((i) => ({ icon: i, size: maxSize(i.sizes ?? '0x0'), svg: isSvgIcon(i) }))
    // Sort: non-SVG first (svg=false < svg=true); within same type, larger wins.
    .sort((a, b) => Number(a.svg) - Number(b.svg) || b.size - a.size);

  for (const candidate of scored) {
    const resolved = resolveUrl(candidate.icon.src, baseUrl);
    if (isHttpsUrl(resolved)) return resolved;
  }
  return null;
}

/** Return the URL of the best maskable icon. Only returns HTTPS URLs. */
export function selectMaskableIcon(
  icons: WebManifestIcon[],
  baseUrl: string
): string | null {
  if (!icons || icons.length === 0) return null;

  const maskable = icons
    .filter((i) => i.purpose?.includes('maskable'))
    .map((i) => ({ icon: i, size: maxSize(i.sizes ?? '0x0'), svg: isSvgIcon(i) }))
    .sort((a, b) => Number(a.svg) - Number(b.svg) || b.size - a.size);

  for (const candidate of maskable) {
    const resolved = resolveUrl(candidate.icon.src, baseUrl);
    if (isHttpsUrl(resolved)) return resolved;
  }
  return null;
}

/** Returns true only if the URL has the https: protocol */
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
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
