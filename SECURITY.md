# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ Yes |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities by emailing the maintainer directly (address in the GitHub profile) or by using [GitHub private security advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You can expect an acknowledgement within 48 hours and a fix or mitigation plan within 14 days for valid reports.

---

## Security design

### Network boundary

```
Internet → SSL proxy (external) → frontend:80 → backend:3001 (internal only)
```

- The backend is **never** exposed directly to the internet
- All inter-service traffic is on a private Docker bridge network
- TLS is terminated by the external reverse proxy (Nginx Proxy Manager, Caddy, Traefik, etc.)

### Authentication

This application has **no built-in authentication**. It is designed to be protected at the infrastructure level. Recommended options:

- IP allowlist at the reverse proxy
- HTTP Basic Auth via Nginx/Caddy
- [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) sidecar (integrates with Authentik, Google, GitHub, etc.)

> Do not expose this service to the open internet without protection. APK builds consume significant server resources and should be limited to trusted users.

### Input validation

All user inputs are validated with Zod schemas on the backend before any processing:

- `pwaUrl`: HTTPS only; no `http://`, `file://`, or `javascript:` schemes
- `packageId`: Must match `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$`
- `appName` / `shortName`: Length-limited, HTML special characters stripped
- `themeColor` / `backgroundColor`: Strict `#rrggbb` hex format
- `iconUrl`: Valid URL, same-origin validation on the backend

### Command injection prevention

All subprocess calls (`keytool`, `gradlew`, `apksigner`) use **array argument passing** via `execa` with `shell: false`. No user input is ever interpolated into shell strings.

### Build isolation

Each APK build runs in its own temporary directory under `/tmp/pwa-maker-<uuid>/`. Directories are:

- Created with `mode 700` (only accessible by the `appuser` process)
- Cleaned up immediately after the APK is downloaded
- Cleaned up after a 1-hour TTL regardless of download status

### Keystore security

- A new keystore is generated for every build
- The keystore password is a cryptographically random 32-character hex string
- Passwords are **never logged** and are discarded after signing
- Keystores are deleted with the temp directory

This design is intentional for sideload-only use. If you need Play Store publishing (which requires a stable signing key), you must modify this behaviour and implement secure key storage.

### Container security

- Backend runs as non-root user `appuser` (UID 1001)
- No `--privileged` flag
- Android SDK directory is read-only for `appuser`
- Container filesystem is not writable except for `/tmp/pwa-maker-*` (build artefacts) and `$GRADLE_USER_HOME` (build cache)

### Rate limiting

Applied at the Express middleware level (not just documentation):

| Limit | Value | Configurable via |
|---|---|---|
| Concurrent builds | 3 | `MAX_CONCURRENT_BUILDS` env var |
| Builds per IP per hour | 10 | `BUILD_RATE_LIMIT_PER_HOUR` env var |
| Token requests per IP per 10 min | 20 | *(not configurable; prevents token harvesting at scale)* |

These limits protect the VPS from resource exhaustion. Reduce them further if your VPS has limited RAM/CPU.

### Bot prevention

Two complementary layers defend against automated build abuse:

**HMAC build token (backend-enforced)**
Every `POST /api/build` must include a short-lived token obtained from `GET /api/token`. The token is `${timestamp_ms}.${HMAC-SHA256(BUILD_TOKEN_SECRET, timestamp_ms)}` and expires after 10 minutes. Automated scripts that POST directly without first fetching a valid token are rejected with 401. Set `BUILD_TOKEN_SECRET` in `.env` (see Configuration).

**Honeypot field (frontend, silent)**
A CSS-invisible `<input name="website">` is present in the build form. Bot auto-fillers populate it; the submit handler silently drops those submissions. Legitimate users never see or interact with it.

### Dependencies

Dependencies are pinned in `package-lock.json`. Run `npm audit` in each package directory to check for known vulnerabilities before deploying to production.

```bash
cd backend  && npm audit
cd frontend && npm audit
```

### Security headers

The Nginx frontend config sets:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`

For production, add `Strict-Transport-Security` (HSTS) at your SSL proxy level.
