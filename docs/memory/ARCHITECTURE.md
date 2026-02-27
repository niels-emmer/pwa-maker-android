# Architecture

## Service topology

```
Browser
  │
  │  HTTPS (handled by external SSL proxy)
  ▼
┌─────────────────────────────────┐
│  frontend  (Nginx, HOST_PORT)   │  Static React SPA
│  /api/* → backend:3001          │  Nginx reverse proxy for API
└─────────────────────────────────┘
  │
  │  HTTP (internal Docker network)
  ▼
┌─────────────────────────────────┐
│  backend   (Express, port 3001) │
│                                 │
│  GET  /api/token                │  Issue short-lived HMAC build token
│  POST /api/build                │  Start a build job
│  GET  /api/build/:id/stream     │  SSE progress stream
│  GET  /api/build/:id/download   │  APK file download
│  GET  /api/health               │  Liveness probe
└─────────────────────────────────┘
  │
  │  child_process / @bubblewrap/core
  ▼
┌─────────────────────────────────┐
│  Build pipeline (per request)   │
│  1. Fetch & validate manifest   │
│  2. TwaGenerator (file gen)     │
│  3. keytool (keystore)          │
│  4. gradlew assembleRelease     │
│  5. apksigner (sign)            │
└─────────────────────────────────┘
  │
  │  /tmp/pwa-maker-<uuid>/
  ▼
┌─────────────────────────────────┐
│  Temp filesystem                │
│  Auto-cleaned after download    │
│  or after 1 hour TTL            │
└─────────────────────────────────┘
```

## Backend internal structure

```
backend/src/
├── index.ts              Entry point, Express setup, middleware wiring
├── types.ts              Shared TypeScript interfaces
├── routes/
│   ├── health.ts         GET /api/health
│   ├── token.ts          GET /api/token — issues HMAC build tokens (anti-bot)
│   └── build.ts          POST /api/build, GET stream, GET download
├── services/
│   ├── manifestFetcher.ts  Fetch & validate PWA web manifest from URL
│   ├── builder.ts          Orchestrate the full APK build pipeline
│   └── buildStore.ts       In-memory store for active build state/jobs
└── middleware/
    ├── rateLimiter.ts      express-rate-limit: builds (10/hr/IP) + tokens (20/10min/IP)
    └── errorHandler.ts     Centralised error → JSON response
```

## Frontend internal structure

```
frontend/src/
├── main.tsx
├── App.tsx
├── types.ts
├── components/
│   ├── Header.tsx
│   ├── BuildForm.tsx       URL input + all build options
│   ├── ManifestPreview.tsx Auto-populated fields from fetched manifest
│   └── BuildProgress.tsx   SSE log display + progress bar + download btn
└── hooks/
    ├── useManifest.ts      Debounced manifest fetch on URL change
    └── useBuild.ts         POST build, consume SSE stream, expose state
```

## Build pipeline detail

1. **Manifest fetch** (`manifestFetcher.ts`)
   - GET `<url>` → parse HTML for `<link rel="manifest">`
   - OR accept direct `.json` manifest URL
   - Validate required fields: `name`, `icons` (≥512px)
   - Extract: name, short_name, theme_color, background_color, icons, start_url, display, orientation

2. **Icon preparation** (`builder.ts`)
   - `isSvgUrl()` checks whether `iconUrl` / `maskableIconUrl` point to SVG files
   - SVG icons are fetched and rasterised to 512×512 PNG via `@resvg/resvg-js` (pure Rust/WASM)
   - The PNG buffer is served on a temporary in-process HTTP server (`127.0.0.1:<random port>`) so bubblewrap can fetch it — bubblewrap requires an HTTP/HTTPS URL, not a file path
   - Server is closed in a `finally` block after `createTwaProject` completes

3. **Project generation** (`builder.ts`)
   - Construct `TwaManifest` from user options + manifest data (with resolved icon URLs)
   - `TwaGenerator.createTwaProject(tmpDir, twaManifest)` → writes all Android Gradle files
   - `chmod +x tmpDir/gradlew`

4. **Keystore** (`builder.ts`)
   - `keytool -genkey` → `tmpDir/keystore.jks`
   - Password: random 32-char hex, discarded after signing (sideload-only)

5. **Gradle build**
   - `./gradlew assembleRelease` in `tmpDir`
   - Streams stdout/stderr to SSE client via `emitProgress` → `res.write()` + `res.flush()`
   - **`res.flush()` is required after every `res.write()`.** Express's `compression` middleware wraps `res.write()` in a gzip encoder; without flushing, events accumulate in the buffer and are only released when `res.end()` is called (i.e. at build completion), which makes progress invisible to the user.
   - GRADLE_USER_HOME mounted as Docker volume for caching

6. **Sign + serve**
   - `apksigner sign` → `app-release-signed.apk`
   - Stored in build store, served on download endpoint
   - Cleanup scheduled: 1 hour TTL or immediately after download

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `HOST_PORT` | `8088` | Host port the frontend nginx binds to (configure in `.env`) |
| `PORT` | `3001` | Backend listen port |
| `ANDROID_HOME` | `/opt/android-sdk` | Android SDK root |
| `JAVA_HOME` | `/usr/lib/jvm/java-17-openjdk-amd64` | JDK path |
| `GRADLE_USER_HOME` | `/home/appuser/.gradle` | Gradle cache dir |
| `MAX_CONCURRENT_BUILDS` | `3` | Concurrent build limit |
| `BUILD_RATE_LIMIT_PER_HOUR` | `10` | Per-IP hourly build limit |
| `BUILD_TTL_HOURS` | `1` | Hours to keep built APK |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `NODE_ENV` | `production` | Node environment |
| `BUILD_TOKEN_SECRET` | *(random)* | HMAC-SHA256 secret for anti-bot build tokens. Generate with `openssl rand -hex 32`. If unset, a random secret is generated at startup (tokens invalidated on restart). |

## Ports (internal Docker network)

| Service | Internal port | Host exposure |
|---|---|---|
| frontend | 80 (Nginx) | `HOST_PORT` (default 8088) — set in `.env` |
| backend | 3001 | not exposed directly — only via Nginx proxy |

## Live deployment

| | |
|---|---|
| **URL** | https://pwa.macjuu.com |
| **Host** | VPS running many other Docker services on ports 80–9494 |
| **Reverse proxy** | SSL-terminating proxy in front of `HOST_PORT=8088` |
| **First deployed** | 2026-02-26 |
