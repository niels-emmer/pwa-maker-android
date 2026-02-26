# Architecture

## Service topology

```
Browser
  │
  │  HTTPS (handled by external SSL proxy)
  ▼
┌─────────────────────────────────┐
│  frontend  (Nginx, port 80)     │  Static React SPA
│  /api/* → backend:3001          │  Nginx reverse proxy for API
└─────────────────────────────────┘
  │
  │  HTTP (internal Docker network)
  ▼
┌─────────────────────────────────┐
│  backend   (Express, port 3001) │
│                                 │
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
│   └── build.ts          POST /api/build, GET stream, GET download
├── services/
│   ├── manifestFetcher.ts  Fetch & validate PWA web manifest from URL
│   ├── builder.ts          Orchestrate the full APK build pipeline
│   └── buildStore.ts       In-memory store for active build state/jobs
└── middleware/
    ├── rateLimiter.ts      express-rate-limit: 3 concurrent, 10/hr/IP
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

2. **Project generation** (`builder.ts`)
   - Construct `TwaManifest` from user options + manifest data
   - `TwaGenerator.createTwaProject(tmpDir, twaManifest)` → writes all Android Gradle files
   - `chmod +x tmpDir/gradlew`

3. **Keystore** (`builder.ts`)
   - `keytool -genkey` → `tmpDir/keystore.jks`
   - Password: random 32-char hex, discarded after signing (sideload-only)

4. **Gradle build**
   - `./gradlew assembleRelease` in `tmpDir`
   - Streams stdout/stderr to SSE client
   - GRADLE_USER_HOME mounted as Docker volume for caching

5. **Sign + serve**
   - `apksigner sign` → `app-release-signed.apk`
   - Stored in build store, served on download endpoint
   - Cleanup scheduled: 1 hour TTL or immediately after download

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Backend listen port |
| `ANDROID_HOME` | `/opt/android-sdk` | Android SDK root |
| `JAVA_HOME` | `/usr/lib/jvm/java-17-openjdk-amd64` | JDK path |
| `GRADLE_USER_HOME` | `/home/appuser/.gradle` | Gradle cache dir |
| `MAX_CONCURRENT_BUILDS` | `3` | Concurrent build limit |
| `BUILD_RATE_LIMIT_PER_HOUR` | `10` | Per-IP hourly build limit |
| `BUILD_TTL_HOURS` | `1` | Hours to keep built APK |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `NODE_ENV` | `production` | Node environment |

## Ports (internal Docker network)

| Service | Internal port | Exposed |
|---|---|---|
| frontend | 80 | 80 (or via proxy) |
| backend | 3001 | not exposed directly |
