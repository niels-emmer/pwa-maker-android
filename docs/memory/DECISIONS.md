# Architecture Decision Records

## ADR-001: Use @bubblewrap/core programmatically (not CLI)

**Date**: 2026-02-26
**Status**: Accepted

**Context**: Bubblewrap's CLI (`bubblewrap init`) is interactive. We need headless server-side execution.

**Decision**: Use `@bubblewrap/core`'s `TwaGenerator.createTwaProject()` directly, then shell out to `./gradlew assembleRelease` and `apksigner` for the build/sign steps.

**Consequences**: Decouples file generation (bubblewrap) from build (Gradle). More reliable than driving the interactive CLI. Risk: bubblewrap core API may change — mitigated by pinning the version.

---

## ADR-002: SSE for build progress, not WebSocket

**Date**: 2026-02-26
**Status**: Accepted

**Context**: APK builds take 30–120 seconds. The user needs progress feedback.

**Decision**: Use Server-Sent Events (SSE). One-directional, no library needed, works through proxies, simpler than WebSocket.

**Consequences**: No bidirectional communication needed. SSE is sufficient. Client uses native `EventSource`.

---

## ADR-003: In-memory build store (no database)

**Date**: 2026-02-26
**Status**: Accepted

**Context**: Builds are ephemeral (TTL 1hr). No need for persistence across restarts.

**Decision**: `Map<string, BuildState>` in memory. UUID key. TTL via `setTimeout`. Restart loses pending builds — acceptable since builds are short-lived and sideload-only.

**Consequences**: Simple. No DB dependency. Single-instance only (acceptable for personal VPS use).

---

## ADR-004: Auto-generate keystore per build, discard passwords

**Date**: 2026-02-26
**Status**: Accepted

**Context**: User wants sideloading only. Play Store requires consistent signing keys.

**Decision**: Generate a new RSA-2048 keystore per build. Store password = random 32-char hex. Delete keystore with temp dir after download.

**Consequences**: Each APK build produces a differently-signed APK. Cannot upgrade an installed app with a new build (must uninstall first). Acceptable for personal sideload use.

---

## ADR-005: No authentication built into the app

**Date**: 2026-02-26
**Status**: Accepted

**Context**: User's other projects use oauth2-proxy + Authentik OIDC sidecar. This project should be deployable standalone.

**Decision**: No auth code in the app. Users are expected to protect the app at the reverse proxy level (basic auth, IP allowlist, or OAuth2 proxy). `docker-compose.prod.yml` documents this expectation.

**Consequences**: Simpler codebase. Auth is infrastructure concern, not application concern (consistent with user's existing pattern).

---

## ADR-006: Gradle cache as Docker named volume

**Date**: 2026-02-26
**Status**: Accepted

**Context**: First Gradle build downloads ~200MB of dependencies. Subsequent builds should reuse the cache.

**Decision**: Mount `gradle_cache` Docker named volume to `/home/appuser/.gradle`. Persists between container restarts.

**Consequences**: Significantly faster subsequent builds (20–30s vs 2–5min). Named volume survives `docker-compose down` (requires `docker-compose down -v` to fully clear).

---

## ADR-007: Frontend served by Nginx with /api proxy

**Date**: 2026-02-26
**Status**: Accepted

**Context**: Need to serve static SPA and proxy API calls to backend.

**Decision**: Nginx in frontend container: serve `/` from static build, proxy `/api/` to `backend:3001`. This matches the user's existing mypolestar pattern.

**Consequences**: Only one port exposed externally. Frontend and backend containers communicate on internal Docker network.

---

## ADR-009: Configurable HOST_PORT via .env (default 8088)

**Date**: 2026-02-26
**Status**: Accepted

**Context**: On initial deploy, both port 80 and 8080 were occupied by existing services on the target VPS (Nginx Proxy Manager on 80, plus 8080–8086 all in use). Hardcoding any port causes immediate failure on busy homelab servers.

**Decision**: Use `${HOST_PORT:-8088}:80` in `docker-compose.yml`. Default is 8088 (not 80 or 8080 which are almost always taken). Users override via `HOST_PORT=<port>` in `.env`.

**Consequences**: Zero-config deploy is more likely to succeed. If 8088 is taken, user can find a free port with `ss -tlnp` and set it in `.env`. No code changes needed for port changes.

**Lesson learned**: On a homelab VPS running many Docker services, ports 80, 8080–8086, 8090, 8095–8097, 8180, 8190 were all in use. Default to something higher (8088+) for out-of-the-box success.

---

## ADR-010: SVG icons rasterised via resvg-js + temp in-process HTTP server

**Date**: 2026-02-27
**Status**: Accepted

**Context**: Bubblewrap's `TwaGenerator` requires raster icon URLs (`image/png`). Many PWA manifests use SVG icons (e.g. served from auth-gated apps where `.png` equivalents don't exist, or where the manifest explicitly lists `.svg`). Simply rejecting SVG icons forced the user to supply an icon URL manually on every build.

**Decision**: When an icon URL ends with `.svg`, fetch the SVG server-side, rasterise it to a 512×512 PNG via `@resvg/resvg-js` (pure Rust/WASM — no system `librsvg2`, no `libvips` required, no native binary outside the WASM module), then spin up a tiny Node.js `http.createServer` on `127.0.0.1:<random port>` that serves the in-memory PNG buffer. Pass that `http://127.0.0.1:<port>/icon.png` URL to TwaManifest. Close the server in a `finally` block after `createTwaProject` returns.

**Alternative considered**: Write the PNG to a temp file and pass a `file://` URL. Rejected — bubblewrap does not support `file://` icon URLs and fetches the icon over HTTP.

**Consequences**: SVG icons work transparently; user never has to manually convert or substitute icons. The temp server is always cleaned up, even if project generation throws. `@resvg/resvg-js` adds ~5 MB to the backend image (WASM binary) but has no runtime system dependencies.

---

## ADR-011: Call res.flush() after every SSE res.write()

**Date**: 2026-02-27
**Status**: Accepted

**Context**: Build progress events were invisible to the frontend during the build; the progress bar stayed at 0% for the full build duration, then all events arrived simultaneously and "Lost connection" was shown instead of the completed state. Root cause: Express's `compression` middleware intercepts `res.write()` and feeds output through a gzip encoder. The encoder buffers chunks internally and only flushes when `res.end()` is called — so all SSE events accumulated in the buffer and were delivered at once when the build finished.

**Decision**: After every `res.write()` in the SSE route (both in the `send()` helper and the heartbeat `setInterval`), call `(res as { flush?: () => void }).flush?.()`. The `flush()` method is injected by the `compression` middleware and forces the gzip encoder to emit a compressed chunk immediately. The optional-chaining guard (`?.`) means it is a no-op when `compression` is not mounted (e.g. tests).

**Complementary fix**: When all buffered events + the connection-close arrive in the same TCP segment, `EventSource.onerror` can fire before React has processed the queued `onmessage` events (including the final `complete` event). Guard against this by wrapping the `onerror` `setState` call in `setTimeout(0)`, which defers it to the next macrotask tick — after all already-queued `onmessage` handlers have run.

**Consequences**: SSE events stream in real time during the build. The `onerror` guard prevents a race condition where "Lost connection" incorrectly overwrites a successful terminal state.

---

## ADR-008: Tailwind CSS, no component library

**Date**: 2026-02-26
**Status**: Accepted

**Context**: User preference: dark-themed, mobile-first UI. Avoid heavy dependencies.

**Decision**: Tailwind CSS only. Custom components. No shadcn/ui, no MUI. Keeps bundle small and styling predictable.

**Consequences**: More CSS to write, but full control over look and feel.
