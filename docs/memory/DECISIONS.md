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

## ADR-008: Tailwind CSS, no component library

**Date**: 2026-02-26
**Status**: Accepted

**Context**: User preference: dark-themed, mobile-first UI. Avoid heavy dependencies.

**Decision**: Tailwind CSS only. Custom components. No shadcn/ui, no MUI. Keeps bundle small and styling predictable.

**Consequences**: More CSS to write, but full control over look and feel.
