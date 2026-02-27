# Agent Instructions — pwa-maker-android

> Read this file at the start of every session. It tells you where the project memory lives and what rules you must follow before writing any code.

## What this project is

A self-hosted web application that converts any HTTPS PWA into a signed Android APK (Trusted Web Activity wrapper). React + Vite frontend, Express + TypeScript backend, `@bubblewrap/core` + Android SDK for the build pipeline. Production: **https://pwa.macjuu.com**

---

## Memory system — read these first

All persistent project knowledge lives in `docs/memory/`. Read the relevant files before starting work:

| File | Read when |
|---|---|
| [`docs/memory/INDEX.md`](docs/memory/INDEX.md) | **Every session** — quick navigation + session checklist |
| [`docs/memory/ARCHITECTURE.md`](docs/memory/ARCHITECTURE.md) | Any session touching backend, Docker, or API |
| [`docs/memory/DECISIONS.md`](docs/memory/DECISIONS.md) | Before making any architectural or library choice |
| [`docs/memory/INVARIABLES.md`](docs/memory/INVARIABLES.md) | Before changing anything security-related |
| [`docs/memory/BUILD_MODEL.md`](docs/memory/BUILD_MODEL.md) | Before changing API contracts or build parameters |
| [`stats.md`](stats.md) | End of session — update session log and cumulative totals |

---

## Hard rules — never violate these

### Branch protection
- `main` is protected. **Never commit directly to `main`.**
- All work must go on a named feature branch → PR → human approval → merge.
- When starting a feature, ask for a branch name if not given one.

### Tests
- Run `npm test` in **both** `backend/` and `frontend/` before every commit.
- All tests must pass. New functions need a passing test before the task is marked done.

### Stats
- Update `stats.md` at the end of every session:
  - Add a row to **Session log** (date, prompt count, debug sessions, LOC delta)
  - Increment **Cumulative totals**
  - Append any new debug sessions to **Debug session log**
  - Run `git ls-files | grep -v "package-lock\|\.png" | xargs wc -l` for the LOC total

### Security
- Never relax any rule in `docs/memory/INVARIABLES.md` without explicit documented justification.
- SSRF protection, input validation, and process isolation rules are non-negotiable.
- Dependabot alerts are active. HIGH-severity findings must be patched in the same session.

### Docs
- `SECURITY.md` must always be present and accurate.
- `README.md` must always reflect the actual test counts and feature set.
- All environment variables must be documented in both `ARCHITECTURE.md` and `.env.example`.

---

## Quick orientation

```
pwa-maker-android/
├── frontend/          React 18 + Vite + TypeScript + Tailwind CSS
├── backend/           Express + TypeScript + @bubblewrap/core + Android SDK
├── docker-compose.yml
├── .env.example       All configurable env vars with defaults
├── docs/memory/       ← project memory (read at session start)
├── SECURITY.md        Security design and reporting policy
├── README.md          User-facing documentation
└── stats.md           Session statistics (maintained by agent)
```

Key ports: frontend nginx on `HOST_PORT` (default 8088, configurable in `.env`); backend Express on 3001 (internal only, never exposed to host).

---

## Dependabot

GitHub Dependabot alerts are enabled. Check for open security advisories before starting a session:

```bash
gh api repos/niels-emmer/pwa-maker-android/vulnerability-alerts 2>/dev/null || \
  echo "Use GitHub UI: Security → Dependabot alerts"
```
