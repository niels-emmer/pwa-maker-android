# Project Stats

> Maintained by Claude. Updated after each session. See `docs/memory/INDEX.md` for the session checklist.

## Session log

| # | Date | Prompts | Debug sessions | LOC delta | Notes |
|---|---|---|---|---|---|
| 1 | 2026-02-26 | 6 | 8 | +4 459 | Initial build — empty repo to full working app |
| 2 | 2026-02-26 | 1 | 2 | +5 | Fix `ConsoleLog` / `Parameters<>` Docker backend errors; update builder test mock |
| 3 | 2026-02-26 | 4 | 2 | +76 | Port conflict resolution; first successful production deploy at pwa.macjuu.com |
| 4 | 2026-02-27 | 3 | 4 | +131 | Debug & fix "Lost connection" / unhealthy-frontend; first successful APK build confirmed |
| 5 | 2026-02-27 | 7 | 4 | +345 | Bot prevention: HMAC build token (backend) + honeypot field (frontend); nginx proxy_pass regression fix |
| 6 | 2026-02-27 | 3 | 0 | +52 | Dependabot fixes: npm overrides for tar@7.5.8 (4×HIGH) and esbuild@0.25.0 (2×MEDIUM) |
| 7 | 2026-02-27 | 4 | 1 | +245 | SVG icon conversion (resvg-js + temp HTTP server); manifest 500→422 error handling; PNG preferred over SVG in icon selection |

---

## Cumulative totals

| Metric | Value |
|---|---|
| **Total prompts** | 28 |
| **Total debug sessions** | 21 |
| **Total lines of code** | 5 643 |
| **Tracked files** | 62 |
| **Tests** | 141 (100 backend + 41 frontend) |
| **Commits** | 26 |
| **Session wall-clock time** | ~140 min cumulative |
| **Production URL** | https://pwa.macjuu.com |

---

## Debug session log

| # | Session | Root cause | Fix |
|---|---|---|---|
| 1 | `@bubblewrap/core` version | `1.21.1` does not exist on npm | Updated to `1.24.1` |
| 2 | Backend test: `countRunningBuilds` | In-memory store leaked between tests (module cache) | Added `_clearStore()` test helper + `beforeEach` reset |
| 3 | Frontend test: `BuildProgress` button not found | `aria-label="Build another APK"` overrode visible text, broke role query | Removed static `aria-label`; accessible name now comes from visible text |
| 4 | Frontend test: `useManifest` timeout | Fake timers + `waitFor` conflict; microtasks not flushing | Switched to `shouldAdvanceTime: true` + `await Promise.resolve()` pattern |
| 5 | Frontend test: download link not found | `aria-label` on `<a>` overrode inner text for accessible name | Removed `aria-label`; link text "Download APK" now serves as accessible name |
| 6 | Preview server port conflict | Docker already held `0.0.0.0:5173`; Vite bound to `[::1]:5173` (IPv6 only) | Set `host: '127.0.0.1'`, `port: 5200` in `vite.config.ts` |
| 7 | Docker frontend build failed | `ManifestDefaults` imported but unused; `noUnusedLocals: true` in tsconfig | Removed unused import from `BuildForm.tsx` |
| 8 | `git push` rejected | GitHub remote had a new commit (user edited README) before local push | `git pull --rebase` then push |
| 9 | Docker backend build: `Property 'Log' does not exist` | `@bubblewrap/core` 1.24.1 exports `ConsoleLog`, not `Log` | Changed import + instantiation to `ConsoleLog` in `builder.ts` |
| 10 | Docker backend build: `Parameters<typeof TwaManifest>` type error | TwaManifest constructor is overloaded, not assignable to `(...args: any) => any` | Cast manifest data `as any`; updated test mock to export `ConsoleLog` |
| 11 | `docker-compose up` failed: port 80 in use | VPS already had a service on port 80 | Changed compose port to `${HOST_PORT:-8088}:80`; document in `.env.example` |
| 12 | Port 8088 default also initially chosen as 8080 — also in use | VPS had ports 8080–8086 all occupied by other Docker services | Scanned with `ss -tlnp`; picked 8088 as first free port in that range |
| 13 | "Lost connection to build server" immediately on build | nginx cached backend IP at startup; backend OOM-killed by Gradle → IP changed on restart → nginx returned 502 forever | Added `resolver 127.0.0.11 valid=30s` + variable proxy_pass so nginx re-resolves dynamically |
| 14 | Frontend `unhealthy` after backend restart | Same nginx DNS-caching issue; `/api/health` proxy returned 502 → healthcheck failed | Same fix as #13 |
| 15 | SSE stream silently dropped during long Gradle run | nginx / upstream load-balancer closed idle connection | Added `: heartbeat` SSE comment every 15 s to keep the stream alive |
| 16 | Gradle OOM on 4 GB Ubuntu host (Intel MacBook Air 2015) | Unconstrained JVM heap exhausted host RAM; OOM-killer terminated Node.js process | `GRADLE_OPTS=-Xmx512m -Xms128m` caps heap; sufficient for a TWA release build |
| 17 | Backend tests: EADDRINUSE port 3001 | `token.routes.test.ts` and `build.routes.test.ts` both imported `index.ts`; vitest `forks` pool bound port 3001 twice | Rewrote `token.routes.test.ts` to use a standalone minimal Express app instead of `index.ts` |
| 18 | Backend tests: 503 test returned 429 | 11 POST requests to `/api/build` in test suite exceeded `BUILD_RATE_LIMIT_PER_HOUR=10`; rate limiter fired before concurrency check | Added `vi.mock('../src/middleware/rateLimiter.js', ...)` to mock `buildRateLimiter` as a no-op passthrough |
| 19 | `git push` rejected | Remote had a new commit (user README edit `2296fde`) after local branch diverged | `git pull --rebase origin main && git push` |
| 20 | nginx manifest 404 regression after deploy | `proxy_pass $backend_upstream/api/` — variable proxy_pass cannot perform "strip prefix / substitute path" rewriting; `/api/manifest?url=...` arrived at backend as `GET /api/` (path mangled, query string lost) | Changed to `proxy_pass $backend_upstream;` — host variable only; nginx forwards original URI unchanged |
| 21 | VPS "lost connection to build server" after dependabot-fixes deploy | Port 3001 not exposed to host (`expose:` not `ports:`); direct curl returned empty. After fixing to `docker compose exec backend`, SSE stream showed bubblewrap error: icon URL (SVG, or `.png` that returned HTML because auth-gated) had wrong Content-Type | Added SVG→PNG conversion in builder via resvg-js + temp in-process HTTP server; prefers PNG in icon selection |

---

## LOC breakdown (session 1)

| Category | Lines |
|---|---|
| TypeScript / TSX (source + tests) | 3 118 |
| Markdown (README, SECURITY, docs/memory) | 731 |
| Config (JSON, HTML, nginx.conf, postcss) | 211 |
| Dockerfile + docker-compose | 88 |
| CSS | 61 |
| **Total** | **4 459** |

---

## LOC breakdown (session 5, cumulative)

| Category | Lines |
|---|---|
| TypeScript / TSX (source + tests) | ~3 550 |
| Markdown (README, SECURITY, docs/memory) | ~820 |
| Config (JSON, HTML, nginx.conf, postcss) | ~220 |
| Dockerfile + docker-compose | ~90 |
| CSS | ~61 |
| **Total** | **5 346** |

---

## LOC breakdown (sessions 6–7, cumulative)

| Category | Lines |
|---|---|
| TypeScript / TSX (source + tests) | ~3 850 |
| Markdown (README, SECURITY, docs/memory) | ~840 |
| Config (JSON, HTML, nginx.conf, postcss) | ~225 |
| Dockerfile + docker-compose | ~90 |
| CSS | ~61 |
| **Total** | **5 643** |

---

## How to update this file

After each Claude coding session, update:
1. Add a row to **Session log** with date, prompt count, debug sessions, and LOC delta
2. Increment **Cumulative totals**
3. Append any new rows to **Debug session log**
4. Run `git ls-files | grep -v "package-lock\|\.png" | xargs wc -l` to get current LOC total
5. Commit: `git add stats.md && git commit -m "chore: update session stats"`
