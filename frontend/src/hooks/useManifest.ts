import { useState, useEffect, useRef } from 'react';
import type { ManifestDefaults } from '../types.js';

interface ManifestState {
  data: ManifestDefaults | null;
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 800;

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetches PWA manifest defaults for a given URL.
 * Debounced and automatically cancelled on URL change.
 */
export function useManifest(pwaUrl: string): ManifestState {
  const [state, setState] = useState<ManifestState>({
    data: null,
    loading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = pwaUrl.trim();

    if (!trimmed) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    if (!isValidHttpsUrl(trimmed)) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    const timer = setTimeout(async () => {
      // Cancel previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/manifest?url=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Server returned ${res.status}`);
        }

        const json = (await res.json()) as { defaults: ManifestDefaults };
        setState({ data: json.defaults, loading: false, error: null });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState({
          data: null,
          loading: false,
          error: (err as Error).message ?? 'Failed to fetch manifest',
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [pwaUrl]);

  return state;
}
