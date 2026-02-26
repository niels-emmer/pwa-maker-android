# Invariables

These rules are permanent. They represent security-by-design decisions that must never be relaxed without explicit documented justification.

## Security invariables

### Network
- The backend is **never** exposed directly to the internet; always behind the Nginx frontend proxy
- All user-facing traffic is expected to be TLS-terminated by the external SSL proxy
- CORS is restricted to the configured `CORS_ORIGIN`

### Input validation
- All user inputs are validated with **Zod** schemas before any processing
- The PWA URL must be HTTPS (no HTTP, no file://, no localhost unless `NODE_ENV=development`)
- Package ID must match `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$`
- App name: max 50 chars, stripped of any shell-special characters
- Icon URLs must be same-origin as the PWA URL or a data URI

### SSRF protection
- All outbound HTTP fetches (manifest discovery, icon resolution) pass through `fetchWithTimeout()` in `manifestFetcher.ts`
- `fetchWithTimeout()` calls `isPrivateHostname()` and throws `{ ssrfBlocked: true }` **before** making the request to any private/loopback/link-local address
- Blocked: `127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `0.x`, `::1`, `fc00::/7`, `fe80::/10`, `localhost`, `metadata.google.internal`
- The `/api/manifest` route surfaces `ssrfBlocked` errors as HTTP 403 (not 500)
- Icon URLs resolved from manifests must remain `https:` — HTTP icons are silently skipped in `selectBestIcon`/`selectMaskableIcon`

### Process isolation
- Each build runs in its own temp directory under `/tmp/pwa-maker-<uuid>/`
- No user input is ever interpolated into shell commands directly — all args are passed as array arguments to `execa` (no shell interpolation)
- `execa` is called with `shell: false` always
- Temp directories are always cleaned up (success, error, or TTL expiry)
- `BuildState.buildDir` **must** be stored from `BuildResult.buildDir` and used in `deleteBuild()` — never derive the cleanup path from `apkPath` (fragile, wrong)

### Keystore
- Auto-generated per build; passwords are random 32-char hex, never logged, never stored after signing
- Keystores are deleted with the temp dir — not retained (sideload-only use case)

### Container
- Backend runs as non-root user `appuser` (UID 1001)
- No `--privileged` flag
- Android SDK directory is read-only for `appuser`
- `/tmp/pwa-maker-*` is the only write path for build artefacts
- Both containers use `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]`
- Frontend additionally needs `cap_add: [NET_BIND_SERVICE]` for Nginx to bind port 80

### Rate limiting
- Hard limits enforced at Express middleware level (not just documentation):
  - 3 concurrent builds total (semaphore)
  - 10 builds per IP per hour (sliding window)
- These limits protect the VPS from runaway CPU/disk usage

## Build invariables

- Target Android SDK: **API 34** (never lower without updating minSdkVersion)
- Min SDK: **21** (Android 5.0 — reasonable floor for TWA)
- APK type: **release, signed** (not debug)
- TWA category: **sideload** (no Play Store metadata generated)
- App version name: `1.0.0`, version code: `1` (user cannot change — sideload only)

## Documentation invariables

- `README.md` must always contain **actual screenshots** (not placeholder images)
- Screenshots are regenerated after every UI change
- `SECURITY.md` must always be present and accurate
- All environment variables must be documented in both `ARCHITECTURE.md` and `.env.example`
