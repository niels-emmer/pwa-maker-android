import { useState, useRef, useCallback } from 'react';
import type { BuildOptions, BuildState, BuildLogEntry } from '../types.js';

const INITIAL_STATE: BuildState = {
  phase: 'idle',
  buildId: null,
  log: [],
  percent: 0,
  errorMessage: null,
};

export function useBuild() {
  const [state, setState] = useState<BuildState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    esRef.current?.close();
    setState(INITIAL_STATE);
  }, []);

  const startBuild = useCallback(async (options: BuildOptions) => {
    // Close any existing SSE connection
    esRef.current?.close();

    setState({
      phase: 'building',
      buildId: null,
      log: [],
      percent: 0,
      errorMessage: null,
    });

    // 1. Fetch a short-lived HMAC build token (anti-bot)
    let buildToken: string;
    try {
      const tokenRes = await fetch('/api/token');
      if (!tokenRes.ok) throw new Error(`Token fetch failed: ${tokenRes.status}`);
      const tokenBody = (await tokenRes.json()) as { token: string };
      buildToken = tokenBody.token;
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        errorMessage: 'Could not start build — please try again.',
      }));
      return;
    }

    // 2. POST to start the build (token included in body)
    let buildId: string;
    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...options, buildToken }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }

      const body = (await res.json()) as { buildId: string };
      buildId = body.buildId;
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: 'error',
        errorMessage: (err as Error).message,
      }));
      return;
    }

    setState((s) => ({ ...s, buildId }));

    // 3. Open SSE stream
    const es = new EventSource(`/api/build/${buildId}/stream`);
    esRef.current = es;

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as Omit<BuildLogEntry, 'timestamp'>;
        const entry: BuildLogEntry = { ...data, timestamp: Date.now() };

        setState((s) => {
          const log = [...s.log, entry];
          const percent = data.percent ?? s.percent;

          if (data.type === 'complete') {
            es.close();
            return { ...s, phase: 'complete', log, percent: 100 };
          }

          if (data.type === 'error') {
            es.close();
            return {
              ...s,
              phase: 'error',
              log,
              percent,
              errorMessage: data.message ?? 'Build failed',
            };
          }

          return { ...s, log, percent };
        });
      } catch {
        // Ignore malformed SSE messages
      }
    };

    es.onerror = () => {
      es.close();
      // Defer by one microtask-tick so that any onmessage events already in the
      // browser's event queue (e.g. the final "complete" event that arrived in
      // the same TCP segment as the connection-close) are processed first.
      // Without this, onerror can fire before React has applied the 'complete'
      // state update, and "Lost connection" would incorrectly overwrite the
      // real terminal state.
      setTimeout(() => {
        setState((s) => {
          if (s.phase === 'complete' || s.phase === 'error') return s;
          return {
            ...s,
            phase: 'error',
            errorMessage: 'Lost connection to build server',
          };
        });
      }, 0);
    };
  }, []);

  const downloadUrl = state.buildId && state.phase === 'complete'
    ? `/api/build/${state.buildId}/download`
    : null;

  return { state, startBuild, reset, downloadUrl };
}
