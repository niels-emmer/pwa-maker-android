import { useEffect, useRef } from 'react';
import type { BuildState } from '../types.js';

interface Props {
  state: BuildState;
  downloadUrl: string | null;
  appName?: string;
  onReset: () => void;
}

export function BuildProgress({ state, downloadUrl, appName, onReset }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.log]);

  const isRunning = state.phase === 'building';
  const isComplete = state.phase === 'complete';
  const isError = state.phase === 'error';

  return (
    <div className="space-y-4" role="region" aria-label="Build progress">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-muted mb-1">
          <span aria-live="polite">
            {isRunning && 'Building…'}
            {isComplete && 'Complete'}
            {isError && 'Failed'}
          </span>
          <span aria-live="polite">{state.percent}%</span>
        </div>
        <div
          className="w-full h-2 bg-surface-2 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={state.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isError
                ? 'bg-danger'
                : isComplete
                ? 'bg-success'
                : 'bg-accent'
            }`}
            style={{ width: `${state.percent}%` }}
          />
        </div>
      </div>

      {/* Log output */}
      <div
        ref={logRef}
        className="bg-surface rounded-lg border border-border p-3 h-56 overflow-y-auto font-mono text-xs leading-relaxed"
        aria-label="Build log"
        aria-live="polite"
        aria-atomic="false"
      >
        {state.log.length === 0 && (
          <span className="text-muted">Waiting for build output…</span>
        )}
        {state.log.map((entry, i) => (
          <div
            key={i}
            className={
              entry.type === 'error'
                ? 'text-danger'
                : entry.type === 'complete'
                ? 'text-success font-semibold'
                : 'text-zinc-400'
            }
          >
            {entry.message}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {isComplete && downloadUrl && (
          <a
            href={downloadUrl}
            download={appName ? `${appName}.apk` : 'app.apk'}
            className="btn-primary flex-1 py-3 text-center text-base font-semibold"
          >
            <span className="flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              Download APK
            </span>
          </a>
        )}

        <button
          onClick={onReset}
          className={`btn-secondary py-3 font-semibold ${isComplete || isError ? 'flex-none px-6' : 'flex-1'}`}
        >
          {isComplete ? 'Build another' : isError ? 'Try again' : 'Cancel'}
        </button>
      </div>

      {isError && state.errorMessage && (
        <div
          className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger"
          role="alert"
        >
          <strong className="block mb-1">Build failed</strong>
          {state.errorMessage}
        </div>
      )}
    </div>
  );
}
