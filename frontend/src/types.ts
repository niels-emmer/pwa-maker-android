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

export interface ManifestDefaults extends Partial<BuildOptions> {
  pwaUrl: string;
}

export type BuildPhase =
  | 'idle'
  | 'loading-manifest'
  | 'ready'
  | 'building'
  | 'complete'
  | 'error';

export interface BuildLogEntry {
  type: 'log' | 'progress' | 'complete' | 'error';
  message?: string;
  percent?: number;
  timestamp: number;
}

export interface BuildState {
  phase: BuildPhase;
  buildId: string | null;
  log: BuildLogEntry[];
  percent: number;
  errorMessage: string | null;
}
