import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuildProgress } from '../src/components/BuildProgress.js';
import type { BuildState } from '../src/types.js';

function makeState(overrides: Partial<BuildState> = {}): BuildState {
  return {
    phase: 'building',
    buildId: 'test-build-id',
    log: [],
    percent: 0,
    errorMessage: null,
    ...overrides,
  };
}

describe('BuildProgress', () => {
  it('renders progress bar', () => {
    render(
      <BuildProgress
        state={makeState({ percent: 42 })}
        downloadUrl={null}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('shows "Building…" while running', () => {
    render(
      <BuildProgress
        state={makeState({ phase: 'building' })}
        downloadUrl={null}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText(/building/i)).toBeInTheDocument();
  });

  it('shows "Complete" when done', () => {
    render(
      <BuildProgress
        state={makeState({ phase: 'complete', percent: 100 })}
        downloadUrl="/api/build/test/download"
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText(/complete/i)).toBeInTheDocument();
  });

  it('shows Download APK button when complete with downloadUrl', () => {
    render(
      <BuildProgress
        state={makeState({ phase: 'complete', percent: 100 })}
        downloadUrl="/api/build/test/download"
        onReset={vi.fn()}
      />
    );
    const link = screen.getByRole('link', { name: /download apk/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/api/build/test/download');
  });

  it('does not show Download APK button when no downloadUrl', () => {
    render(
      <BuildProgress
        state={makeState({ phase: 'complete', percent: 100 })}
        downloadUrl={null}
        onReset={vi.fn()}
      />
    );
    expect(screen.queryByRole('link', { name: /download apk/i })).not.toBeInTheDocument();
  });

  it('shows error message when phase is error', () => {
    render(
      <BuildProgress
        state={makeState({
          phase: 'error',
          errorMessage: 'Gradle build failed',
        })}
        downloadUrl={null}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/gradle build failed/i)).toBeInTheDocument();
  });

  it('renders log entries', () => {
    render(
      <BuildProgress
        state={makeState({
          log: [
            { type: 'log', message: 'Step one', timestamp: 1 },
            { type: 'log', message: 'Step two', timestamp: 2 },
          ],
        })}
        downloadUrl={null}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
  });

  it('calls onReset when cancel/try again button clicked', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();

    render(
      <BuildProgress
        state={makeState({ phase: 'error', errorMessage: 'Failed' })}
        downloadUrl={null}
        onReset={onReset}
      />
    );

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('shows "Build another" button after successful build', () => {
    render(
      <BuildProgress
        state={makeState({ phase: 'complete', percent: 100 })}
        downloadUrl="/api/build/test/download"
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /build another/i })).toBeInTheDocument();
  });

  it('shows waiting message when log is empty', () => {
    render(
      <BuildProgress state={makeState()} downloadUrl={null} onReset={vi.fn()} />
    );
    expect(screen.getByText(/waiting for build output/i)).toBeInTheDocument();
  });
});
