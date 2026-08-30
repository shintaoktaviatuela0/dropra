<h1 align="center">Dopra</h1>

<p align="center"><strong>Drop. Share. Done.</strong><br/>Simple file sharing without the complexity.</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/deploy-Railway-success.svg?style=flat-square" alt="Railway" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-informational.svg?style=flat-square" alt="Node >= 20" />
</p>

---

## What is Dopra?

Dopra is a modern, lightweight, self-hosted file host — a privacy-friendly alternative to services
like GoFile, MediaFire and classic Zippyshare-style hosts. Drop a file, get a short link, share it.
No account required.

It is built to be **extremely easy to deploy**: a single Node.js container, an SQLite database, and
local file storage on one persistent volume. There is **no** separate frontend, no reverse proxy, no
PostgreSQL, no Redis and no S3 to configure.

> Dopra is a derivative work based on the MIT-licensed [Chibisafe](https://github.com/chibisafe/chibisafe)
> project. See [Credits](#credits).

## Screenshots

> _Screenshots go here._
>
> - Homepage upload area
> - Public file page with preview
> - Admin dashboard

## Features

- ⬆️ Drag & drop, file picker, clipboard paste and mobile uploads
- 🔗 Short, readable file URLs (`/A7x92K`) — never long UUIDs
- 📥 Streaming downloads with HTTP Range, HEAD and conditional requests (great for video)
- 🧩 Chunked uploads for large files
- 🔒 Optional per-file password protection (hashed, never stored in plaintext)
- ⏳ Optional expiration (1h → 30d, or never) with an automatic cleanup job
- 🔢 Optional per-file download limits
- 👤 Anonymous uploads with a private deletion token
- 🖼️ Inline previews for images, video, audio, PDF and text
- 🛠️ Full admin dashboard: files, storage, settings, security, reports, system
- 🌍 Realtime origin intelligence — animated world map of upload countries, live feed and leaderboard
- 🚩 Public file reporting with moderation, bulk actions and retention-based cleanup
- 🌗 Polished light / dark / system themes
- 🩺 `/health` endpoint for Railway healthchecks
- 🗄️ SQLite (WAL) + local storage — one service, one volume
- 🚫 No ads, no third-party tracking

## Quick deploy on Railway

> **Goal:** GitHub repository → Deploy on Railway → attach one Volume → set admin credentials → working file host.

1. **Deploy the repository** — On [Railway](https://railway.com), create a new project from this GitHub
   repository. Railway auto-detects the `Dockerfile`.
2. **Attach a Volume** — Add a Volume to the service and set its **mount path** to `/data`.
3. **Configure variables** (Service → Variables):

   | Variable         | Value                                  |
   | ---------------- | -------------------------------------- |
   | `ADMIN_USERNAME` | your admin username                    |
   | `ADMIN_PASSWORD` | a strong password (used once, then hashed) |
   | `SESSION_SECRET` | a long random string (or leave unset — one is generated & persisted) |
   | `PUBLIC_URL`     | your public URL, e.g. `https://file.example.com` |

   `DATA_DIR` defaults to `/data` and `PORT` is provided by Railway automatically — you do not need to set them.
4. **Generate a domain** — Under Settings → Networking, generate a public domain.
5. **Open Dopra** — Visit your domain. The homepage upload area is live; the admin panel is at `/admin`.

On first boot Dopra creates the `/data` structure, initializes SQLite, runs migrations and creates the
admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Redeploys **never** reset your database, files,
settings or admin password.

## Docker deployment

```bash
docker build -t dopra .

docker run -d --name dopra \
  -p 3000:3000 \
  -v dopra_data:/data \
  -e ADMIN_USERNAME="admin" \
  -e ADMIN_PASSWORD="change-me" \
  -e PUBLIC_URL="https://file.example.com" \
  dopra
```

Then open <http://localhost:3000>.

## Other platforms

Dopra is a single container that listens on `$PORT` and stores everything in `DATA_DIR`, so it runs
anywhere you can attach persistent storage:

| Platform            | What to do                                                                       |
| ------------------- | -------------------------------------------------------------------------------- |
| **Render**          | Docker environment + a Disk mounted at `/data`. Health check path `/health`.      |
| **Fly.io**          | `fly launch` (uses the Dockerfile) + a Volume mounted at `/data`.                 |
| **Heroku**          | Container Registry deploy. Heroku dynos have ephemeral disks — attach durable storage or prefer a VPS. |
| **VPS (Docker)**    | The `docker run` command above, with nginx/Caddy/Traefik in front for TLS.        |
| **VPS (bare Node)** | `npm ci && npm run build && npm start` behind a process manager (systemd, pm2).   |

Whatever you choose, only two things matter: persistent storage mounted at `DATA_DIR`, and letting the
platform provide `PORT`. Reverse proxies are handled automatically — see
[Public URLs & reverse proxies](#public-urls--reverse-proxies).

## Local development

```bash
cp .env.example .env      # edit ADMIN_USERNAME / ADMIN_PASSWORD
npm install
npm run dev               # http://localhost:3000
```

Useful scripts:

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start with hot reload                |
| `npm run build`     | Compile TypeScript to `dist/`        |
| `npm start`         | Run the compiled server              |
| `npm test`          | Run unit + integration tests         |
| `npm run typecheck` | Type-check without emitting          |
| `npm run lint`      | Lint the source                      |

## Environment variables

| Variable          | Required | Default        | Description                                                        |
| ----------------- | -------- | -------------- | ------------------------------------------------------------------ |
| `NODE_ENV`        | no       | `development`  | `production` on Railway.                                           |
| `PORT`            | no       | `3000`         | Listen port. Railway injects this automatically.                  |
| `DATA_DIR`        | no       | `/data` (prod) | Root directory for all persistent data.                           |
| `PUBLIC_URL`      | no       | auto-detected  | Public base URL used to build shareable links.                    |
| `ADMIN_USERNAME`  | yes\*    | `admin`        | Administrator username (used on first boot).                      |
| `ADMIN_PASSWORD`  | yes\*    | —              | Administrator password. Hashed with Argon2id; never stored plain. |
| `SESSION_SECRET`  | no       | generated      | Cookie-signing secret. Auto-generated & persisted if unset.       |
| `TRUST_PROXY`     | no       | `true`         | Honour `X-Forwarded-*` headers from a reverse proxy.               |
| `MAX_UPLOAD_SIZE` | no       | `2147483648`   | Hard upload cap in bytes (2 GB).                                   |

\* Required to create the admin account on first boot. After the account exists they are only used if it is missing.

The server always binds to `0.0.0.0` and honours `PORT`. It never hardcodes a production port.

## Public URLs & reverse proxies

Dopra figures out its own public address, so short links are correct out of the box on Railway,
Render, Heroku, Fly, Docker, a VPS behind nginx/Caddy/Traefik, or GitHub Codespaces — **no
configuration required**.

Resolution order:

1. `PUBLIC_URL` env var, or **Admin → Settings → General → Public Base URL** (explicit override)
2. `X-Forwarded-Host` / `X-Forwarded-Proto` sent by the reverse proxy
3. The request's own `Host` header

This matters because most platforms rewrite `Host` to `localhost:PORT` and send the real domain in
`X-Forwarded-Host`. Forwarded host values are validated (`host[:port]` only), so a spoofed header
cannot inject content into generated links. In the browser, copy/share buttons are built from the
page's own origin, so they always match the domain you are actually visiting.

Set `PUBLIC_URL` explicitly when you want links pinned to one canonical domain (e.g. behind a CDN or
when serving several hostnames). If your proxy does **not** send `X-Forwarded-*` headers, set
`TRUST_PROXY=false`.

## Persistent storage

All state lives under `DATA_DIR` (mount your Railway Volume here):

```
/data
├── uploads/      # stored files (sharded, generated names)
├── database/     # dopra.sqlite (+ WAL)
├── thumbnails/   # cached previews
├── temp/         # in-progress chunk uploads
├── avatars/
└── system/       # generated secrets (e.g. session secret)
```

Directories are created automatically at **runtime** (never during the Docker build), so the Railway
Volume is respected.

## Updating

Push to your repository (or pull a new image) and redeploy. Migrations run automatically on startup and
are idempotent — your data is preserved.

## Backup & restore

Dopra keeps everything under `DATA_DIR`, so a backup is just a copy of that directory:

```bash
# Backup (stop the service or snapshot the volume for consistency)
tar czf dopra-backup.tar.gz -C /data .

# Restore into a fresh volume mounted at /data
tar xzf dopra-backup.tar.gz -C /data
```

On Railway, use Volume backups/snapshots.

## Security

- Passwords (admin and per-file) are hashed with **Argon2id**; plaintext is never stored or logged.
- Sessions use signed, `HttpOnly`, `SameSite=Lax` cookies (Secure in production). No tokens in `localStorage`.
- Login, upload, download and report endpoints are rate-limited; abusive IPs can be blocked.
- Uploads are stored under generated names — original filenames are metadata only, preventing path traversal.
- Active content (HTML/SVG/JS) is always served as an attachment with `Content-Security-Policy: sandbox`
  and `X-Content-Type-Options: nosniff`, and is never rendered inline in Dopra's origin.
- Security headers are applied via Helmet; short codes are cryptographically random with reserved-route protection.

## Architecture

```
Browser
   ↓
Single Dopra Node.js service  (Fastify + server-rendered HTML)
   ↓
SQLite (WAL)  +  Local storage
   ↓
Railway Volume mounted at /data
```

One container serves the frontend, REST API, uploads, streaming downloads, previews, short links, the
admin dashboard and background maintenance.

## License

Dopra is released under the [MIT License](LICENSE).

## Credits

Dopra is a derivative work based on **Chibisafe** (© 2023 chibisafe, MIT License). It reuses concepts and
portions of logic — chunked uploads, file handling patterns, short-link identifiers and database modelling —
adapted to Dopra's single-container architecture. See the [NOTICE](NOTICE) file. Dopra is an independent
project and is not affiliated with or endorsed by Chibisafe.
