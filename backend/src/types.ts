// ─── Build options ────────────────────────────────────────────────────────────

export type DisplayMode = 'standalone' | 'fullscreen' | 'minimal-ui';
export type OrientationMode = 'portrait' | 'landscape' | 'default';

export interface BuildOptions {
  pwaUrl: string;
  appName: string;
  shortName: string;
  packageId: string;
  display: DisplayMode;
  orientation: OrientationMode;
  themeColor: string;
  backgroundColor: string;
  iconUrl: string;
  maskableIconUrl: string | null;
}

// ─── Build state ──────────────────────────────────────────────────────────────

export type BuildStatus = 'queued' | 'running' | 'complete' | 'error';

export interface BuildState {
  id: string;
  status: BuildStatus;
  options: BuildOptions;
  /** Full path to the temp build directory (e.g. /tmp/pwa-maker-<uuid>/) — used for cleanup */
  buildDir: string | null;
  apkPath: string | null;
  apkFileName: string | null;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
  /** SSE listeners waiting for progress events */
  listeners: Array<(event: ProgressEvent) => void>;
  /** Buffered events for late SSE subscribers */
  eventBuffer: ProgressEvent[];
}

// ─── SSE progress events ──────────────────────────────────────────────────────

export type ProgressEventType = 'log' | 'progress' | 'complete' | 'error';

export interface ProgressEvent {
  type: ProgressEventType;
  message?: string;
  percent?: number;
}

// ─── Web manifest (subset we care about) ─────────────────────────────────────

export interface WebManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

export interface WebManifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  orientation?: string;
  theme_color?: string;
  background_color?: string;
  icons?: WebManifestIcon[];
  scope?: string;
}

// ─── API response types ───────────────────────────────────────────────────────

export interface StartBuildResponse {
  buildId: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
}
