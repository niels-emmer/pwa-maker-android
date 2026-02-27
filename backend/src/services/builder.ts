import { mkdir, chmod, rm, readdir } from 'fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execa } from 'execa';
import type { BuildOptions } from '../types.js';

const ANDROID_HOME = process.env.ANDROID_HOME ?? '/opt/android-sdk';
const JAVA_HOME = process.env.JAVA_HOME ?? '/usr/lib/jvm/java-17-openjdk-amd64';
const APKSIGNER = join(ANDROID_HOME, 'build-tools', '35.0.0', 'apksigner');
const KEYTOOL = join(JAVA_HOME, 'bin', 'keytool');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgressCallback = (message: string, percent: number) => void;

// ─── SVG → PNG conversion ─────────────────────────────────────────────────────

/** True when the URL path ends with .svg (case-insensitive). */
export function isSvgUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.svg');
  } catch {
    return false;
  }
}

/**
 * Fetch an SVG from `url` and rasterise it to a square PNG of `size`×`size` px.
 * Transparency is preserved (no background fill). Uses @resvg/resvg-js (pure
 * Rust/WASM) — no system-level librsvg or libvips required.
 */
async function fetchAndConvertSvg(url: string, size: number): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch SVG icon (${res.status}): ${url}`);
  }
  const svgBuffer = Buffer.from(await res.arrayBuffer());
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svgBuffer, { fitTo: { mode: 'width', value: size } });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

/**
 * Spin up a tiny in-process HTTP server that serves `buffer` as image/png on
 * a random OS-assigned port. Returns the URL and a `close()` to tear it down.
 * Used so that bubblewrap (which only accepts HTTP/HTTPS icon URLs) can fetch
 * the in-memory converted PNG without writing it to disk.
 */
function servePngBuffer(buffer: Buffer): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buffer.length });
      res.end(buffer);
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ url: `http://127.0.0.1:${port}/icon.png`, close: () => server.close() });
    });
    server.on('error', reject);
  });
}

/**
 * If an icon URL points to an SVG, convert it to a 512×512 PNG and serve it
 * temporarily so bubblewrap can fetch a raster image. Returns resolved URLs
 * plus a `cleanup()` that shuts down any temp servers.
 */
async function prepareIconUrls(options: BuildOptions): Promise<{
  iconUrl: string | null;
  maskableIconUrl: string | null;
  cleanup: () => void;
}> {
  const closers: Array<() => void> = [];

  async function maybeConvert(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;
    if (!isSvgUrl(url)) return url;
    const pngBuffer = await fetchAndConvertSvg(url, 512);
    const { url: pngUrl, close } = await servePngBuffer(pngBuffer);
    closers.push(close);
    return pngUrl;
  }

  const [iconUrl, maskableIconUrl] = await Promise.all([
    maybeConvert(options.iconUrl),
    maybeConvert(options.maskableIconUrl),
  ]);

  return { iconUrl, maskableIconUrl, cleanup: () => closers.forEach((c) => c()) };
}

export interface BuildResult {
  apkPath: string;
  buildDir: string;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function buildApk(
  options: BuildOptions,
  onProgress: ProgressCallback
): Promise<BuildResult> {
  const buildId = randomBytes(8).toString('hex');
  const buildDir = join(tmpdir(), `pwa-maker-${buildId}`);
  await mkdir(buildDir, { recursive: true });

  try {
    return await runPipeline(options, buildDir, onProgress);
  } catch (err) {
    // Always clean up on error
    await rm(buildDir, { recursive: true, force: true });
    throw err;
  }
}

// ─── Pipeline stages ──────────────────────────────────────────────────────────

async function runPipeline(
  options: BuildOptions,
  buildDir: string,
  onProgress: ProgressCallback
): Promise<BuildResult> {
  // 1. Generate Android project via @bubblewrap/core
  onProgress('Generating Android project files…', 15);
  await generateAndroidProject(options, buildDir);

  // 2. Ensure gradlew is executable
  await chmod(join(buildDir, 'gradlew'), 0o755);

  // 3. Generate keystore
  onProgress('Generating signing keystore…', 30);
  const keystorePassword = randomBytes(16).toString('hex');
  const keystorePath = join(buildDir, 'keystore.jks');
  await generateKeystore(keystorePath, keystorePassword);

  // 4. Gradle build
  onProgress('Starting Gradle build (first run may take 2–5 min while downloading dependencies)…', 40);
  await runGradle(buildDir, onProgress);

  // 5. Find unsigned APK
  onProgress('Locating unsigned APK…', 82);
  const unsignedApk = await findApk(buildDir, 'unsigned');

  // 6. Sign APK
  onProgress('Signing APK…', 88);
  const signedApkPath = unsignedApk.replace('-unsigned', '-signed');
  await signApk(unsignedApk, signedApkPath, keystorePath, keystorePassword);

  onProgress('Build complete!', 100);
  return { apkPath: signedApkPath, buildDir };
}

// ─── Project generation ───────────────────────────────────────────────────────

async function generateAndroidProject(
  options: BuildOptions,
  buildDir: string
): Promise<void> {
  // Dynamically import @bubblewrap/core (ESM compatible)
  const { TwaManifest, TwaGenerator, ConsoleLog } = await import('@bubblewrap/core');

  const host = new URL(options.pwaUrl).hostname;
  const startPath = new URL(options.pwaUrl).pathname || '/';

  // Convert SVG icons to PNG — bubblewrap requires rasterised images.
  // A temporary in-process HTTP server serves the converted PNG so bubblewrap
  // can fetch it without writing a temp file or modifying the build directory.
  const { iconUrl, maskableIconUrl, cleanup } = await prepareIconUrls(options);

  try {
    const twaManifestData = {
      packageId: options.packageId,
      host,
      name: options.appName,
      launcherName: options.shortName.slice(0, 12),
      display: options.display,
      orientation: options.orientation,
      themeColor: options.themeColor,
      themeColorDark: options.themeColor,
      navigationColor: options.themeColor,
      navigationColorDark: options.themeColor,
      navigationDividerColor: '#000000',
      navigationDividerColorDark: '#000000',
      backgroundColor: options.backgroundColor,
      enableNotifications: false,
      startUrl: startPath,
      iconUrl,
      maskableIconUrl,
      monochromeIconUrl: null,
      appVersion: '1.0.0',       // TwaManifest reads data.appVersion (not appVersionName)
      appVersionCode: 1,
      splashScreenFadeOutDuration: 300,
      shortcuts: [],
      generatorApp: 'pwa-maker-android',
      webManifestUrl: null,
      signingKey: {
        path: join(buildDir, 'keystore.jks'),
        alias: 'key0',
      },
      additionalTrustedOrigins: [],
      retainedBundles: [],
      sdkVersion: 34,
      minSdkVersion: 21,
      isMetaQuest: false,
      fingerprints: [],
      features: {},
      alphaDependencies: { enabled: false },
      enableSiteSettingsShortcut: true,
      isChromeOSOnly: false,
      isMonochrome: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const twaManifest = new TwaManifest(twaManifestData as any);
    const generator = new TwaGenerator();
    const log = new ConsoleLog();

    await generator.createTwaProject(buildDir, twaManifest, log);
  } finally {
    cleanup();
  }
}

// ─── Keystore generation ──────────────────────────────────────────────────────

async function generateKeystore(
  keystorePath: string,
  password: string
): Promise<void> {
  await execa(
    KEYTOOL,
    [
      '-genkey',
      '-v',
      '-keystore', keystorePath,
      '-alias', 'key0',
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-storepass', password,
      '-keypass', password,
      '-dname', 'CN=PWA Maker,OU=PWA Maker,O=PWA Maker,L=Unknown,ST=Unknown,C=US',
    ],
    { env: buildEnv() }
  );
}

// ─── Gradle build ─────────────────────────────────────────────────────────────

async function runGradle(
  buildDir: string,
  onProgress: ProgressCallback
): Promise<void> {
  const gradlew = join(buildDir, 'gradlew');

  const gradleProcess = execa(
    gradlew,
    ['assembleRelease', '--no-daemon', '--stacktrace'],
    {
      cwd: buildDir,
      env: {
        ...buildEnv(),
        GRADLE_USER_HOME: process.env.GRADLE_USER_HOME ?? join(process.env.HOME ?? '/tmp', '.gradle'),
        // Cap the Gradle JVM heap to prevent OOM kills on low-memory servers
        // (e.g. a 4 GB host). 512 m is sufficient for a standard TWA build.
        // The env var is read by the Gradle wrapper before it launches the JVM.
        GRADLE_OPTS: process.env.GRADLE_OPTS ?? '-Xmx512m -Xms128m',
      },
      reject: false, // We handle exit code ourselves
    }
  );

  let percent = 42;

  // Stream stdout/stderr to progress callback
  gradleProcess.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (!line) return;
    percent = Math.min(percent + 1, 80);
    onProgress(line, percent);
  });

  gradleProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (!line) return;
    onProgress(`[gradle] ${line}`, percent);
  });

  const result = await gradleProcess;

  if (result.exitCode !== 0) {
    throw new Error(
      `Gradle build failed with exit code ${result.exitCode}. ` +
        'Check the build log above for details.'
    );
  }
}

// ─── APK discovery ────────────────────────────────────────────────────────────

async function findApk(buildDir: string, variant: 'unsigned' | 'release'): Promise<string> {
  const releaseDir = join(buildDir, 'app', 'build', 'outputs', 'apk', 'release');
  let entries: string[];

  try {
    entries = await readdir(releaseDir);
  } catch {
    throw new Error(
      `Could not find APK output directory. Expected: ${releaseDir}. ` +
        'The Gradle build may have failed silently.'
    );
  }

  const apkName = entries.find((f) => f.endsWith('.apk') && f.includes(variant));
  if (!apkName) {
    // Fallback: any APK
    const anyApk = entries.find((f) => f.endsWith('.apk'));
    if (anyApk) return join(releaseDir, anyApk);
    throw new Error(`No APK found in ${releaseDir}. Files: ${entries.join(', ')}`);
  }

  return join(releaseDir, apkName);
}

// ─── APK signing ─────────────────────────────────────────────────────────────

async function signApk(
  unsignedApk: string,
  signedApk: string,
  keystorePath: string,
  password: string
): Promise<void> {
  await execa(
    APKSIGNER,
    [
      'sign',
      '--ks', keystorePath,
      '--ks-key-alias', 'key0',
      '--ks-pass', `pass:${password}`,
      '--key-pass', `pass:${password}`,
      '--out', signedApk,
      unsignedApk,
    ],
    { env: buildEnv() }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ANDROID_HOME,
    ANDROID_SDK_ROOT: ANDROID_HOME,
    JAVA_HOME,
    PATH: [
      join(JAVA_HOME, 'bin'),
      join(ANDROID_HOME, 'cmdline-tools', 'latest', 'bin'),
      join(ANDROID_HOME, 'platform-tools'),
      join(ANDROID_HOME, 'build-tools', '35.0.0'),
      process.env.PATH,
    ]
      .filter(Boolean)
      .join(':'),
  };
}
