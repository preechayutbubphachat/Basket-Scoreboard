# Single Node App Plesk Deployment

Use this deployment mode when Plesk does not allow custom nginx reverse proxy directives.

One Fastify Node.js app serves both:

- API routes under `/api/v1/*`
- React/Vite frontend routes from `apps/web/dist`

Production domain:

```text
https://scoreboard.ob-gate.com
```

The browser should call same-origin API paths:

```text
/api/v1/auth/me
/api/v1/auth/login
/api/v1/auth/logout
/api/v1/auth/csrf
```

It must not call `https://api.scoreboard.ob-gate.com/api/v1/...` directly.

## Build

From the project root:

```bash
npm install
npm run build:single
```

`build:single` builds:

- `apps/api/dist`
- `apps/web/dist`

The root `app.js` startup file loads the compiled API entry from `apps/api/dist/index.js`. It does not run migrations automatically.

## Plesk Node.js Settings

- Domain: `scoreboard.ob-gate.com`
- Application Root: project root
- Document Root: project root
- Application Startup File: `app.js`
- Application Mode: `production`
- Proxy mode: ON
- Smart static files processing: OFF
- Serve static files directly by nginx: OFF

Fastify serves built frontend assets from `apps/web/dist/assets` and returns `apps/web/dist/index.html` for non-API browser `GET` routes such as `/login`, `/admin`, `/operator/matches`, and `/public/scoreboard/:matchId`.

API misses under `/api/*` remain JSON 404 responses and never serve the React index shell.

## Environment

Production example:

```bash
NODE_ENV=production
APP_NAME=Basketball Scoreboard

PUBLIC_BASE_URL=https://scoreboard.ob-gate.com
API_BASE_URL=https://scoreboard.ob-gate.com/api/v1
API_ALLOWED_ORIGINS=https://scoreboard.ob-gate.com
API_CORS_CREDENTIALS=true

AUTH_COOKIE_NAME=basket_session
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=Lax
AUTH_COOKIE_DOMAIN=

DEV_AUTH_ENABLED=false
AUTH_BOOTSTRAP_ENABLED=false

REALTIME_MODE=polling
POLLING_INTERVAL_OPERATOR_MS=500
POLLING_INTERVAL_PUBLIC_MS=1000
SOCKET_IO_ENABLED=false

WEB_DIST_DIR=apps/web/dist
```

Prefer a host-only cookie by leaving `AUTH_COOKIE_DOMAIN` empty. Do not set `Domain=api.scoreboard.ob-gate.com`.

Set `VITE_API_BASE_URL=` in `apps/web/.env.production` so the Vite build uses the default same-origin `/api/v1` API base.

## Runtime Checks

Expected:

```http
GET /api/v1/health
```

returns JSON:

```json
{
  "status": "ok",
  "service": "basket-scoreboard-api"
}
```

Expected login diagnostics:

- `GET /api/v1/auth/me` returns `401` before login.
- `POST /api/v1/auth/login` with a wrong password reaches Fastify and returns JSON `401 INVALID_CREDENTIALS`.
- `POST /api/v1/auth/login` with a correct password returns `200`, sets the `basket_session` HttpOnly cookie, and returns a CSRF token.

Do not convert write requests to `GET`. Keep CSRF, RBAC, secure cookies, server-side sessions, and event-store append-only rules enabled.
