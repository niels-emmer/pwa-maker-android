import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createBuild,
  getBuild,
  updateBuild,
  deleteBuild,
  emitProgress,
  addListener,
  removeListener,
  countRunningBuilds,
  _clearStore,
} from '../src/services/buildStore.js';
import type { BuildOptions } from '../src/types.js';

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

describe('buildStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _clearStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    _clearStore();
  });

  it('creates a build with queued status', () => {
    const state = createBuild(mockOptions);
    expect(state.id).toBeDefined();
    expect(state.status).toBe('queued');
    expect(state.apkPath).toBeNull();
    expect(state.listeners).toHaveLength(0);
  });

  it('retrieves a build by id', () => {
    const state = createBuild(mockOptions);
    expect(getBuild(state.id)).toBe(state);
  });

  it('returns undefined for unknown build id', () => {
    expect(getBuild('non-existent-uuid')).toBeUndefined();
  });

  it('updates build status', () => {
    const state = createBuild(mockOptions);
    updateBuild(state.id, { status: 'running' });
    expect(getBuild(state.id)?.status).toBe('running');
  });

  it('deletes a build', () => {
    const state = createBuild(mockOptions);
    deleteBuild(state.id);
    expect(getBuild(state.id)).toBeUndefined();
  });

  it('counts running builds correctly', () => {
    expect(countRunningBuilds()).toBe(0);
    const s1 = createBuild(mockOptions);
    const s2 = createBuild(mockOptions);
    updateBuild(s1.id, { status: 'running' });
    updateBuild(s2.id, { status: 'running' });
    expect(countRunningBuilds()).toBe(2);
    updateBuild(s1.id, { status: 'complete' });
    expect(countRunningBuilds()).toBe(1);
  });

  it('emits progress to listeners', () => {
    const state = createBuild(mockOptions);
    const received: string[] = [];
    addListener(state.id, (event) => {
      if (event.message) received.push(event.message);
    });
    emitProgress(state.id, { type: 'log', message: 'hello' });
    expect(received).toContain('hello');
  });

  it('replays buffered events to late subscribers', () => {
    const state = createBuild(mockOptions);
    emitProgress(state.id, { type: 'log', message: 'first event' });

    const received: string[] = [];
    // Subscribe AFTER the event was emitted
    addListener(state.id, (event) => {
      if (event.message) received.push(event.message);
    });

    expect(received).toContain('first event');
  });

  it('removes listeners correctly', () => {
    const state = createBuild(mockOptions);
    const received: string[] = [];
    const listener = (event: import('../src/types.js').ProgressEvent) => {
      if (event.message) received.push(event.message);
    };
    addListener(state.id, listener);
    removeListener(state.id, listener);
    emitProgress(state.id, { type: 'log', message: 'should not appear' });
    expect(received).toHaveLength(0);
  });

  it('ignores operations on unknown build ids', () => {
    expect(() => updateBuild('bad-id', { status: 'running' })).not.toThrow();
    expect(() => emitProgress('bad-id', { type: 'log', message: 'x' })).not.toThrow();
    expect(() => addListener('bad-id', vi.fn())).not.toThrow();
    expect(() => removeListener('bad-id', vi.fn())).not.toThrow();
  });
});
