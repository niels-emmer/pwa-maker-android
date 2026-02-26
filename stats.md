# Project Stats

> Maintained by Claude. Updated after each session. See `docs/memory/INDEX.md` for the session checklist.

## Session log

| # | Date | Prompts | Debug sessions | LOC delta | Notes |
|---|---|---|---|---|---|
| 1 | 2026-02-26 | 6 | 8 | +4 459 | Initial build — empty repo to full working app |
| 2 | 2026-02-26 | 1 | 2 | +5 | Fix `ConsoleLog` / `Parameters<>` Docker backend errors; update builder test mock |

---

## Cumulative totals

| Metric | Value |
|---|---|
| **Total prompts** | 7 |
| **Total debug sessions** | 10 |
| **Total lines of code** | 4 464 |
| **Tracked files** | 57 |
| **Tests** | 83 (46 backend + 37 frontend) |
| **Commits** | 5 |
| **Session wall-clock time** | ~20 min cumulative |

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

## How to update this file

After each Claude coding session, update:
1. Add a row to **Session log** with date, prompt count, debug sessions, and LOC delta
2. Increment **Cumulative totals**
3. Append any new rows to **Debug session log**
4. Run `git ls-files | grep -v "package-lock\|\.png" | xargs wc -l` to get current LOC total
5. Commit: `git add stats.md && git commit -m "chore: update session stats"`
