import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useManifest } from '../src/hooks/useManifest.js';

describe('useManifest', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns idle state for empty URL', () => {
    const { result } = renderHook(() => useManifest(''));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('returns idle state for non-HTTPS URL', () => {
    const { result } = renderHook(() => useManifest('http://example.com'));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('sets loading=true for valid HTTPS URL', () => {
    const { result } = renderHook(() => useManifest('https://example.com'));
    expect(result.current.loading).toBe(true);
  });

  it('fetches manifest after debounce and populates data', async () => {
    const mockDefaults = {
      pwaUrl: 'https://example.com',
      appName: 'Test App',
      shortName: 'Test',
      packageId: 'com.example.test',
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ defaults: mockDefaults }),
    } as Response);

    const { result } = renderHook(() => useManifest('https://example.com'));

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve(); // flush microtasks
    });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    expect(result.current.data?.appName).toBe('Test App');
    expect(result.current.error).toBeNull();
  }, 10_000);

  it('sets error when fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    } as Response);

    const { result } = renderHook(() => useManifest('https://example.com'));

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    expect(result.current.error).toContain('Server error');
    expect(result.current.data).toBeNull();
  }, 10_000);

  it('does not fetch before debounce timeout', () => {
    renderHook(() => useManifest('https://example.com'));
    vi.advanceTimersByTime(400); // less than 800ms debounce
    expect(fetch).not.toHaveBeenCalled();
  });
});
