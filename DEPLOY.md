# Deploying Class Course

Everything runs in Docker on the shared VPS `91.108.111.237`, in
`/var/www/classcourse`, behind the host's **nginx** (HTTPS from certbot).
Images are built in **GitHub Actions** and pushed to GHCR; the VPS only pulls
them (`docker-compose.prod.yml`). Never run a build on the VPS: other apps
share its memory.

## 0. Addresses

| Address | Serves | Container → host port (127.0.0.1 only) |
|---|---|---|
| `https://myclasscourse.in` | student site (`frontend`) | `3100` |
| `https://www.myclasscourse.in` | 301 → `https://myclasscourse.in` | (nginx) |
| `https://admin.myclasscourse.in` | admin panel (`admin`) | `3101` |
| `https://api.myclasscourse.in` | API (`backend`) | `4150` (4000 belongs to another app) |

Postgres has no host port. Ports live in the server's root `.env` and in
`deploy/nginx/classcourse.conf`; change both together, after running the
preflight (`bash ~/.claude/skills/deploy-preflight/scripts/check.sh --host 91.108.111.237 --user kunal`).

## 1. How a deploy runs (`.github/workflows/deploy.yml`, on every push to `main`)

1. Build `backend` + `backend-tools` (the build stage: Prisma CLI, ts-node) → GHCR.
2. SSH to the VPS: `git reset` to the commit, then `deploy/deploy.sh sha-<commit> backend`
   (pulls, runs `migrate`, starts the API, waits until healthy).
3. Build `frontend` + `admin`. The student site prerenders **from the live API**,
   so it must be up; if it isn't, this build fails and the running site stays as it was.
4. `deploy/deploy.sh sha-<commit> frontend admin`.

Images are tagged `latest` and `sha-<commit>`. **Rollback:** on the VPS,
`deploy/deploy.sh sha-<older commit> frontend admin` (or `backend`; migrations
only go forward).

Repo secrets: `VPS_HOST`, `VPS_USER` (`kunal`), `VPS_SSH_KEY` (a key used only
by this workflow; its public half is in `~kunal/.ssh/authorized_keys`).

## 2. Server files (created once, never committed)

- `/var/www/classcourse/.env`: `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`
  (only applied when the volume is first created), `BACKEND_PORT`, `FRONTEND_PORT`, `ADMIN_PORT`.
- `/var/www/classcourse/backend/.env`: from `backend/.env.production.example`:
  `NODE_ENV=production`, new `JWT_ACCESS_SECRET` and `SETTINGS_ENCRYPTION_KEY`
  (**back this one up**: without it saved R2/SMTP/Razorpay secrets can't be read),
  `CORS_ORIGIN`, `TRUST_PROXY=1` (nginx is the one hop), `FRONTEND_URL`.
  The API refuses to start in production with `CORS_ORIGIN=*`, a short JWT
  secret or a localhost `FRONTEND_URL`.
- The `NEXT_PUBLIC_*` values are build args in the workflow, not server files.

## 3. One-off commands (on the VPS, in `/var/www/classcourse`)

```sh
dc="docker compose -f docker-compose.prod.yml"
$dc run --rm migrate npm run seed                                   # safe to re-run
$dc run --rm migrate npm run create-admin -- you@example.com 'strong-password'
$dc ps; $dc logs -f backend
deploy/deploy.sh latest backend frontend admin                      # manual redeploy
```

## 4. nginx

`deploy/nginx/classcourse.conf` is the template (HTTP only). It was installed with:
```sh
sudo cp deploy/nginx/classcourse.conf /etc/nginx/sites-available/classcourse
sudo ln -s /etc/nginx/sites-available/classcourse /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx --redirect -d myclasscourse.in -d www.myclasscourse.in -d admin.myclasscourse.in -d api.myclasscourse.in
```
Certbot then edits the live copy (443 + redirects) and renews it on its own. If you
change the template, re-apply your change to `/etc/nginx/sites-available/classcourse`
by hand rather than copying over certbot's edits.

## 5. Configure services in the admin panel

Sign in at `https://admin.myclasscourse.in`. Settings → each page tests the
connection before saving; secrets are encrypted.
0. **General** — site address `https://myclasscourse.in` (used in email links).
1. **Storage (R2)** — public bucket for images **and a separate private bucket
   for premium notes** (paid notes can't be sold without it). Add a CORS rule on
   both buckets allowing `PUT`/`GET`/`HEAD` from `https://admin.myclasscourse.in`
   (Settings → Storage has a "Copy" button with the exact policy when opened there).
2. **Email (SMTP)** — business mailbox; use "Send test email".
3. **Payments (Razorpay)** — start with `rzp_test_` keys; switch to live after
   KYC. Copy the **webhook URL** shown there
   (`https://api.myclasscourse.in/api/payments/webhook/razorpay`) into Razorpay Dashboard → Webhooks
   with events `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed`, and the same
   webhook secret. Keep **auto-capture ON**.
4. **Pages** — publish About, Contact, Privacy, Terms, Refund policy (Razorpay
   KYC checks them), and the FAQ, after the owner approves the drafts.

## 6. Backups

Postgres data lives in the `classcourse_postgres_data` volume. Daily dump (cron):
```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U classcourse -Fc classcourse_db > backup-$(date +%F).dump
```
Keep copies off the server (e.g. a private R2 bucket). Restore with `pg_restore`.
Also keep `SETTINGS_ENCRYPTION_KEY` somewhere safe — backups of the `Setting`
table are useless without it.

## 7. Checks after deploying

- `https://api.myclasscourse.in/health/ready` → 200
- `https://myclasscourse.in` loads with the padlock; `https://www.myclasscourse.in` redirects to it
- `https://myclasscourse.in/sitemap.xml` lists `https://myclasscourse.in/...` links (not localhost)
- Admin login works; Settings → Storage / Email / Payments "Test" all pass
- A Razorpay **test-mode** purchase end to end, including closing the tab
  before returning (the webhook must unlock it)
- `docker stats` — the API normally sits well under 100 MB of its 512 MB limit
