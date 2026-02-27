# Build Model

The exact product being built: parameters, user-facing options, output artefacts.

## Input parameters (user provides in the UI)

| Field | Type | Required | Source | Validation |
|---|---|---|---|---|
| `pwaUrl` | string (URL) | ✅ | User types | HTTPS only, reachable |
| `appName` | string | ✅ | Auto-filled from manifest `name` | 1–50 chars |
| `shortName` | string | ✅ | Auto-filled from manifest `short_name` | 1–12 chars |
| `packageId` | string | ✅ | Auto-generated from host | `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$` |
| `display` | enum | ✅ | Auto-filled from manifest `display` | standalone / fullscreen / minimal-ui |
| `orientation` | enum | ✅ | Auto-filled from manifest `orientation` | portrait / landscape / default |
| `themeColor` | hex string | ✅ | Auto-filled from manifest `theme_color` | `#rrggbb` |
| `backgroundColor` | hex string | ✅ | Auto-filled from manifest `background_color` | `#rrggbb` |
| `iconUrl` | string (URL) | ✅ | Auto-filled: largest non-maskable icon in manifest; PNG preferred over SVG | Must be HTTPS; SVG icons are auto-converted to 512×512 PNG server-side |
| `maskableIconUrl` | string (URL) | ❌ | Auto-filled if maskable icon found in manifest | Optional; SVG auto-converted if needed |

All auto-filled fields are editable by the user.

## Build pipeline output

| Artefact | Path in temp dir | Delivered to user |
|---|---|---|
| Android project | `tmpDir/app/` | No |
| Keystore | `tmpDir/keystore.jks` | No |
| Unsigned APK | `tmpDir/app/build/outputs/apk/release/app-release-unsigned.apk` | No |
| **Signed APK** | `tmpDir/app-release-signed.apk` | ✅ via download endpoint |

## API contract

### GET /api/token
Returns a short-lived HMAC-SHA256 signed build token. Must be fetched immediately before `POST /api/build`.

Response:
```json
{ "token": "1708992000000.a3f9c8..." }
```
- Format: `${timestamp_ms}.${HMAC-SHA256(BUILD_TOKEN_SECRET, timestamp_ms)}`
- TTL: 10 minutes
- Rate limited: 20 requests per IP per 10 minutes

### POST /api/build
Request body (`buildToken` is extracted pre-validation and discarded; not part of `BuildOptions`):
```json
{
  "buildToken": "<token from GET /api/token>",
  "pwaUrl": "https://example.com",
  "appName": "My App",
  "shortName": "MyApp",
  "packageId": "com.example.myapp",
  "display": "standalone",
  "orientation": "portrait",
  "themeColor": "#1a1a2e",
  "backgroundColor": "#16213e",
  "iconUrl": "https://example.com/icon-512.png",
  "maskableIconUrl": null
}
```
Response:
```json
{ "buildId": "uuid-v4" }
```

### GET /api/build/:buildId/stream (SSE)
Events:
```
data: {"type":"log","message":"Fetching manifest...","percent":10}
data: {"type":"log","message":"Generating Android project...","percent":25}
data: {"type":"log","message":"Building APK...","percent":40}
data: {"type":"progress","message":"[Gradle] :app:compileReleaseJavaWithJavac","percent":65}
data: {"type":"complete","percent":100}
data: {"type":"error","message":"Build failed: ..."}
```

### GET /api/build/:buildId/download
- Returns APK as `application/vnd.android.package-archive`
- `Content-Disposition: attachment; filename="<appName>.apk"`
- Triggers cleanup after successful stream

### GET /api/health
```json
{ "status": "ok", "version": "1.0.0", "uptime": 12345 }
```

## Fixed build parameters (not user-configurable)

| Parameter | Value | Reason |
|---|---|---|
| Target SDK | 34 | Current stable Android |
| Min SDK | 21 | Android 5.0 (TWA minimum) |
| Version name | `1.0.0` | Sideload only |
| Version code | `1` | Sideload only |
| Signing algo | RSA-2048 | Standard |
| Keystore validity | 10000 days | Long enough for sideload |
| APK type | release | Not debug |
