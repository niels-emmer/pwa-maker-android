import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';
import type { BuildState, BuildOptions, ProgressEvent } from '../types.js';

const TTL_MS = (parseInt(process.env.BUILD_TTL_HOURS ?? '1', 10) || 1) * 60 * 60 * 1000;

// ─── Store ────────────────────────────────────────────────────────────────────

const store = new Map<string, BuildState>();

export function createBuild(options: BuildOptions): BuildState {
  const id = randomUUID();
  const state: BuildState = {
    id,
    status: 'queued',
    options,
    buildDir: null,
    apkPath: null,
    apkFileName: null,
    errorMessage: null,
    createdAt: Date.now(),
    completedAt: null,
    listeners: [],
    eventBuffer: [],
  };
  store.set(id, state);
  scheduleTTL(id);
  return state;
}

export function getBuild(id: string): BuildState | undefined {
  return store.get(id);
}

export function updateBuild(id: string, patch: Partial<BuildState>): void {
  const state = store.get(id);
  if (!state) return;
  Object.assign(state, patch);
}

export function deleteBuild(id: string): void {
  const state = store.get(id);
  if (!state) return;
  store.delete(id);
  // Use the stored buildDir for cleanup — more reliable than deriving it from apkPath
  if (state.buildDir) {
    rm(state.buildDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ─── Progress emission ────────────────────────────────────────────────────────

export function emitProgress(id: string, event: ProgressEvent): void {
  const state = store.get(id);
  if (!state) return;
  state.eventBuffer.push(event);
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch {
      // Ignore disconnected listeners
    }
  }
}

export function addListener(
  id: string,
  listener: (event: ProgressEvent) => void
): void {
  const state = store.get(id);
  if (!state) return;
  // Replay buffered events for late subscribers
  for (const event of state.eventBuffer) {
    listener(event);
  }
  state.listeners.push(listener);
}

export function removeListener(
  id: string,
  listener: (event: ProgressEvent) => void
): void {
  const state = store.get(id);
  if (!state) return;
  state.listeners = state.listeners.filter((l) => l !== listener);
}

// ─── Concurrency tracking ─────────────────────────────────────────────────────

export function countRunningBuilds(): number {
  let count = 0;
  for (const state of store.values()) {
    if (state.status === 'running' || state.status === 'queued') count++;
  }
  return count;
}

// ─── TTL cleanup ──────────────────────────────────────────────────────────────

function scheduleTTL(id: string): void {
  setTimeout(() => deleteBuild(id), TTL_MS);
}

// ─── Testing helpers ─────────────────────────────────────────────────────────

/** Clear all builds from the store. Only use in tests. */
export function _clearStore(): void {
  store.clear();
}
