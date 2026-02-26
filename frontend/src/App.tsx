import { Header } from './components/Header.js';
import { BuildForm } from './components/BuildForm.js';
import { BuildProgress } from './components/BuildProgress.js';
import { useBuild } from './hooks/useBuild.js';
import type { BuildOptions } from './types.js';

export function App() {
  const { state, startBuild, reset, downloadUrl } = useBuild();

  const isBuilding = state.phase === 'building';
  const showProgress = state.phase !== 'idle' && state.phase !== 'ready';

  function handleSubmit(options: BuildOptions) {
    void startBuild(options);
  }

  return (
    <div className="min-h-screen bg-surface text-white flex flex-col">
      <Header />

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Turn any PWA into an Android APK
          </h2>
          <p className="text-muted max-w-xl mx-auto text-sm sm:text-base">
            Enter your PWA URL, configure the options, and download a signed APK ready
            to sideload onto any Android device — no Android Studio required.
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-1 border border-border rounded-2xl p-5 sm:p-8">
          {showProgress ? (
            <BuildProgress
              state={state}
              downloadUrl={downloadUrl}
              appName={state.phase === 'complete' ? undefined : undefined}
              onReset={reset}
            />
          ) : (
            <BuildForm onSubmit={handleSubmit} disabled={isBuilding} />
          )}
        </div>

        {/* How it works */}
        {!showProgress && (
          <section className="mt-10" aria-label="How it works">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 text-center">
              How it works
            </h3>
            <ol className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  step: '1',
                  title: 'Enter your URL',
                  desc: 'Paste your PWA URL. Manifest fields are auto-filled.',
                },
                {
                  step: '2',
                  title: 'Adjust options',
                  desc: 'Tweak name, package ID, colors, and orientation.',
                },
                {
                  step: '3',
                  title: 'Download APK',
                  desc: 'Get a signed APK and install it directly on your device.',
                },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-muted text-accent text-sm font-bold flex items-center justify-center">
                    {step}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-muted text-xs mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted">
        PWA Maker — generates Trusted Web Activity (TWA) APKs via{' '}
        <a
          href="https://github.com/GoogleChromeLabs/bubblewrap"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-white"
        >
          Bubblewrap
        </a>
        . For sideloading only.
      </footer>
    </div>
  );
}
