export function Header() {
  return (
    <header className="border-b border-border bg-surface-1">
      <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
        {/* Android robot icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-muted flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 fill-accent"
            aria-hidden="true"
          >
            <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A5.84 5.84 0 0 0 12 1.75c-.96 0-1.86.23-2.66.63L7.85.9c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31A5.983 5.983 0 0 0 6 8h12a5.98 5.98 0 0 0-2.47-5.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
          </svg>
        </div>

        <div>
          <h1 className="text-white font-semibold text-lg leading-tight">PWA Maker</h1>
          <p className="text-muted text-xs">Android APK generator</p>
        </div>

        <div className="ml-auto">
          <a
            href="https://github.com/niels-emmer/pwa-maker-android"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-white transition-colors"
            aria-label="GitHub repository"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
              <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
