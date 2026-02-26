import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBuild } from '../src/hooks/useBuild.js';
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

// Mock EventSource
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = MockEventSource.OPEN;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn(() => { this.readyState = MockEventSource.CLOSED; });
  dispatchMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  dispatchError() {
    this.onerror?.(new Event('error'));
  }
}

let mockES: MockEventSource;

vi.stubGlobal(
  'EventSource',
  vi.fn().mockImplementation(() => {
    mockES = new MockEventSource();
    return mockES;
  })
);

describe('useBuild', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', vi.fn().mockImplementation(() => {
      mockES = new MockEventSource();
      return mockES;
    }));
  });

  it('starts in idle phase', () => {
    const { result } = renderHook(() => useBuild());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.downloadUrl).toBeNull();
  });

  it('transitions to building phase on startBuild', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ buildId: 'test-123' }),
    } as Response);

    const { result } = renderHook(() => useBuild());

    await act(async () => {
      await result.current.startBuild(mockOptions);
    });

    expect(result.current.state.phase).toBe('building');
    expect(result.current.state.buildId).toBe('test-123');
  });

  it('transitions to error phase on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Server busy' }),
    } as Response);

    const { result } = renderHook(() => useBuild());

    await act(async () => {
      await result.current.startBuild(mockOptions);
    });

    expect(result.current.state.phase).toBe('error');
    expect(result.current.state.errorMessage).toContain('Server busy');
  });

  it('appends log entries from SSE messages', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ buildId: 'test-456' }),
    } as Response);

    const { result } = renderHook(() => useBuild());

    await act(async () => {
      await result.current.startBuild(mockOptions);
    });

    act(() => {
      mockES.dispatchMessage({ type: 'log', message: 'Generating project…', percent: 20 });
    });

    await waitFor(() =>
      expect(result.current.state.log.some((e) => e.message === 'Generating project…')).toBe(true)
    );
    expect(result.current.state.percent).toBe(20);
  });

  it('transitions to complete phase on complete event', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ buildId: 'build-complete-789' }),
    } as Response);

    const { result } = renderHook(() => useBuild());

    await act(async () => {
      await result.current.startBuild(mockOptions);
    });

    act(() => {
      mockES.dispatchMessage({ type: 'complete', percent: 100 });
    });

    await waitFor(() => expect(result.current.state.phase).toBe('complete'));
    expect(result.current.downloadUrl).toBe('/api/build/build-complete-789/download');
  });

  it('transitions to error phase on error event', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ buildId: 'build-err-999' }),
    } as Response);

    const { result } = renderHook(() => useBuild());

    await act(async () => {
      await result.current.startBuild(mockOptions);
    });

    act(() => {
      mockES.dispatchMessage({ type: 'error', message: 'Gradle failed', percent: 60 });
    });

    await waitFor(() => expect(result.current.state.phase).toBe('error'));
    expect(result.current.state.errorMessage).toBe('Gradle failed');
  });

  it('resets state on reset()', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ buildId: 'reset-test' }),
    } as Response);

    const { result } = renderHook(() => useBuild());

    await act(async () => {
      await result.current.startBuild(mockOptions);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.buildId).toBeNull();
    expect(result.current.state.log).toHaveLength(0);
  });
});
