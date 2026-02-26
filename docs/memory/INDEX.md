# PWA Maker Android — Agent Memory Index

> Read this file at the start of every session on this project.

## Quick navigation

| File | Purpose |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, service topology, data flow |
| [INVARIABLES.md](./INVARIABLES.md) | Constants that must never change |
| [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records (ADRs) |
| [BUILD_MODEL.md](./BUILD_MODEL.md) | The exact product being built, parameters, user options |
| [../../stats.md](../../stats.md) | Session statistics — prompts, debug sessions, LOC, time |

## Project at a glance

**What it is**: A web application that accepts a PWA URL + configuration options and produces a downloadable Android APK (Trusted Web Activity wrapper) via a server-side build pipeline.

**Repo**: `/Users/nemmer/repositories/pwa-maker-android`

**Stack**: React + Vite frontend · Express + TypeScript backend · `@bubblewrap/core` + Android SDK for APK generation

**Deployment**: Docker Compose on a VPS, behind an SSL-terminating reverse proxy (e.g. Nginx Proxy Manager, Caddy, Traefik)

## Session checklist

- [ ] Read this INDEX.md
- [ ] Read ARCHITECTURE.md for any session involving backend changes
- [ ] Check DECISIONS.md before making architectural choices
- [ ] After UI changes: regenerate screenshots (`docs/screenshots/`) and update README.md
- [ ] After schema/API changes: update BUILD_MODEL.md
- [ ] After every session: update `stats.md` (prompts, debug sessions, LOC delta)
- [ ] All new functions need a passing test before marking the task complete
- [ ] Run `npm test` in both `backend/` and `frontend/` before committing

## Current status

| Layer | State |
|---|---|
| docs/memory | ✅ Complete |
| backend | ✅ Complete |
| frontend | ✅ Complete |
| docker | ✅ Complete |
| tests | ✅ Passing |
| README / SECURITY | ✅ Complete |
