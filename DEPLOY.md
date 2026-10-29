# Deploying Class Course — backend

Backend + Postgres run with Docker Compose on a VPS, behind a reverse proxy
(nginx or Caddy) that terminates HTTPS. The `admin` and `frontend` Next.js
apps are deployed separately (not covered yet — see `task.md` Phase 6).

Everything below is checked by the backend's startup validation
(`backend/src/config/env.ts`): with `NODE_ENV=production` the API **refuses to
start** with `CORS_ORIGIN=*`, a short JWT secret, or a localhost `FRONTEND_URL`.

## 1. Before the first deploy

1. **Run the preflight** from the repo root, against the target server:
   ```sh
   bash ~/.claude/skills/deploy-preflight/scripts/check.sh --host <vps> --user <ssh-user>
   ```
   Fix every FAIL. On a shared VPS, a name or port collision means another
   app's containers — never force past it.
2. **Root `.env`** (host-side, see `.env.example`):
   - `POSTGRES_PASSWORD` — long random value, set **before** the first start
     (it's only applied when the volume is created).
   - `POSTGRES_PORT` / `BACKEND_PORT` — free ports on that host.
   - `BIND_ADDRESS=127.0.0.1` — keep it. Postgres must never be public; the
     API is reached through the reverse proxy.
3. **`backend/.env`** (the app, see `backend/.env.example`):
   | Variable | Production value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `JWT_ACCESS_SECRET` | new 64-hex secret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `SETTINGS_ENCRYPTION_KEY` | new 64-hex key — **back it up**. Losing it makes saved R2/SMTP/Razorpay secrets unreadable (re-enter them in admin). |
   | `CORS_ORIGIN` | `https://<site>,https://<admin-site>` |
   | `TRUST_PROXY` | `1` behind nginx/Caddy (`2` if Cloudflare proxies too) |
   | `FRONTEND_URL` | `https://<site>` (email links) |
   | `DATABASE_URL` | ignored in Docker (compose builds it from the root `.env`) |
   | `R2_*`, `SMTP_*`, `RAZORPAY_*` | optional fallbacks — normally entered in the admin panel |
   Never copy the development `JWT_ACCESS_SECRET` / `SETTINGS_ENCRYPTION_KEY` to production.

## 2. Deploy

```sh
docker compose up -d --build        # builds, starts Postgres, applies migrations, starts the API
docker compose ps                    # backend should become "healthy"
curl -s http://127.0.0.1:$BACKEND_PORT/health/ready   # {"status":"ok","database":"ok"}
```

Build on a machine with enough free RAM (>2 GB) or move builds to CI — see the
preflight skill's memory notes. Every service has `mem_limit` and a V8 heap cap.

First time only:
```sh
docker compose run --rm migrate npm run seed                                   # classes, mediums, subjects, chapters, draft pages
docker compose run --rm migrate npm run create-admin -- you@example.com 'strong-password'
```
Both are safe to re-run (they never overwrite edits).

Updates: `git pull && docker compose up -d --build` — migrations run automatically
before the new API starts; the old one gets 15 s to finish in-flight requests.

## 3. Reverse proxy (example: Caddy)

```
api.classcourse.in {
    reverse_proxy 127.0.0.1:4000
}
```
nginx equivalent: `proxy_pass http://127.0.0.1:4000;` plus
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and
`proxy_set_header X-Forwarded-Proto $scheme;`, and `client_max_body_size 5m;`
(bulk question imports are up to 3 MB).

## 4. Configure services in the admin panel

Settings → each page tests the connection before saving; secrets are encrypted.
1. **Storage (R2)** — public bucket for images **and a separate private bucket
   for premium notes** (paid notes can't be sold without it). Add a CORS rule on
   both buckets allowing `PUT` from the admin site's origin.
2. **Email (SMTP)** — business mailbox; use "Send test email".
3. **Payments (Razorpay)** — start with `rzp_test_` keys; switch to live after
   KYC. Copy the **webhook URL** shown there into Razorpay Dashboard → Webhooks
   with events `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed`, and the same
   webhook secret. Keep **auto-capture ON**.
4. **Pages** — publish About, Contact, Privacy, Terms, Refund policy (Razorpay
   KYC checks them), and the FAQ, after the owner approves the drafts.

## 5. Backups

Postgres data lives in the `classcourse_postgres_data` volume. Daily dump (cron):
```sh
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > backup-$(date +%F).dump
```
Keep copies off the server (e.g. a private R2 bucket). Restore with `pg_restore`.
Also keep `SETTINGS_ENCRYPTION_KEY` somewhere safe — backups of the `Setting`
table are useless without it.

## 6. Checks after deploying

- `GET /health/ready` → 200
- Admin login works; Settings → Storage / Email / Payments "Test" all pass
- A Razorpay **test-mode** purchase end to end, including closing the tab
  before returning (the webhook must unlock it)
- `docker stats` — the API normally sits well under 100 MB of its 512 MB limit
