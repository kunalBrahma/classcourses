# Class Course — Claude Code Instructions

## Project: Class Course
An online learning platform for students of Assam. It has chapter-wise
question-answers, MCQ quizzes, premium PDF notes and videos.

- `plan.md`: architecture, data model, API and page map. Read it before building a feature.
- `task.md`: phase-by-phase checklist. Tick items off as you finish them, and
  add anything new you discover.
- Source of truth: the client's requirements PDF (v1.0, 28 Sep 2026) and the
  dailyassam.com "Assamese Medium" screenshot. Anything marked **PENDING**
  there is listed in `task.md → Waiting on client`. Do NOT guess those values.
  Build them as admin-editable settings or placeholders.

### Content hierarchy (hard rule)
`Medium → Class → Subject → (optional Part / Book / Section) → Chapter`
- **Medium** (Assamese Medium, English Medium, …) is a DB table managed from
  admin. Never hardcode a medium list or an enum.
- **ClassLevel** is a DB table managed from admin (Catalog → Classes), shared
  by all mediums. It has `name` ("Class 5", "LKG", "BA 1st Year"),
  `nativeName?`, a unique `slug` (the link part) and `order`. Admins can
  add, rename, reorder, hide or delete classes; delete is refused while
  subjects or quizzes use the class. The seed creates Class 1–12
  (`class-1`…`class-12`). **Never assume classes are numbers**: refer to a
  class by `id` (admin APIs: `classId`) or `slug` (public URLs and APIs:
  `classSlug`; a bare number like `5` is read as `class-5`).
  `User.classLevelId` stores a student's class.
- **Subjects are per medium AND per class**, so each medium has its own list.
- **SubjectPart** is optional grouping inside a subject (e.g. "Part 1",
  "Book 1", "Writing Skills"). Chapter order runs across parts.
- Public URL shape: `/[medium]/[class]/[subject]/[chapter]` (all slugs, e.g. `/assamese-medium/class-5/…` or `/assamese-medium/lkg/…`).

### Catalog backend (Phase 1, built)
- Code:
  - `src/services/catalog.service.ts`: reading order, prev/next, slug lookups
  - `src/controllers/catalog.controller.ts`: public
  - `src/controllers/adminCatalog.controller.ts`: admin
  - `src/validations/catalog.validation.ts`
  - `src/utils/slug.ts`
- **Reading order:** `Chapter.order` is the position *within its part* (or
  within the no-part group). The subject's reading order is:
  1. chapters with no part
  2. then each part, by `SubjectPart.order`
  - It is always computed with `sortChaptersInReadingOrder()`. Never sort
    chapters by `order` alone across a whole subject.
  - `Chapter.number` is only the display number ("Chapter 7").
- **Public API** (`/api/catalog`, no auth) hides anything inactive or
  unpublished. It returns 404 for those, never a partial result. `:classSlug` is
  the class's link part; a bare number (`11`) means `class-11`. A class appears under a medium only if that
  medium has active subjects in it.
- **Admin API** (`/api/admin/...`):
  - Reorder endpoints take the **full** sibling id list.
  - Deleting a subject that has chapters needs `?force=true`.
  - A medium that has subjects can't be deleted; set it inactive instead.
  - Deleting a part moves its chapters to the no-part group.
- **Seed** (`npm run seed`, data in `prisma/seed-data/catalog.ts`) only
  creates what is missing and never overwrites admin edits.
- **Tests** call `seedCatalog()` from `prisma/seed.ts`. When you add a new
  table, add it to `resetDatabase()` in `tests/setup.ts`, in FK-safe order.

### Chapter content backend (Phase 2, built)
- **Models:** `Question` has kind QA|MCQ and source TEXTBOOK|EXTRA; MCQs store
  `options` (JSON string[]) and a 0-based `correctIndex`. `Video` stores a
  YouTube ID plus `format` (LANDSCAPE 16:9 | SHORT 9:16; a `/shorts/` link
  sets SHORT, otherwise the admin picks). `parseYouTubeLink()` in
  `src/utils/youtube.ts` is the parser; the admin's copy in `lib/content.ts`
  is preview-only. `Video.featuredAt` (admin sends `featured: true/false`)
  puts a video in the home page row: public `GET /api/catalog/videos/featured`.
- **Medium links** can't use a site page's word (`RESERVED_TOP_LEVEL` in
  `src/utils/slug.ts`). When the frontend gets a new top-level route, add its
  word there.
- **Public visibility:** use `publicSubjectWhere` / `publicChapterWhere` and
  `catalogHref()` from `catalog.service.ts` for any new public query, never
  re-list the active/published rules.
- **Search:** public `GET /api/catalog/search?q=` (2–60 chars, max 20 results,
  `searchLimiter`). Prisma `contains` + `mode: "insensitive"`, no raw SQL.
- Practice check `POST /api/catalog/questions/:id/check` has `checkAnswerLimiter`
  (40/min per IP): it reveals answers that quizzes reuse.
- **Ordering:** questions are ordered **per section** (chapter + source +
  kind), which matches the page sections Textbook Q&A / Extra Q&A / Extra MCQs.
- **Rich text is HTML, sanitised on write** by
  `src/utils/sanitizeHtml.ts`. This allowlist is the XSS boundary, so never
  store admin HTML without it. Images must be absolute http(s) URLs (uploads
  go to R2's public bucket through `POST /api/admin/uploads/images`, which
  signs the exact type and size).
- **Validation rules** live in `normalizeQuestion()`
  (`src/services/question.service.ts`). The admin form and the bulk importer
  (`questionImport.service.ts`) both use it, so never duplicate those rules.
- **MCQ answers never ship with the public chapter payload**, because the
  Phase 3 quiz reuses the same questions. Practice "reveal" goes through
  `POST /api/catalog/questions/:id/check`. The quiz must likewise never send
  `correctIndex` before the student answers.
- **Bulk import:**
  - Dry-run is the default. Commit is all-or-nothing.
  - Row numbers are spreadsheet rows (the header is row 1).
  - Plain-text cells keep their line breaks as `<br>`.

### Quiz & coins backend (Phase 3, built)
- **Engine:** `src/services/quiz.service.ts`. Routes are `/api/quiz`,
  authenticated and rate limited per user.
  - Flow: `start` → `attempts/:id/next` (reveals a question and starts its
    clock) → `attempts/:id/answer` → … → finished.
  - Pausing with a question on screen **forfeits** that question.
  - Unfinished attempts expire at IST midnight (`src/utils/istDate.ts`).
    Expiry is applied lazily on read.
  - Attempts snapshot `secondsPerQuestion` and `passMark` when they start.
- **Never** put a question id, `correctIndex` or `explanation` in a quiz
  response before that question has been answered.
- **Every state change** is a guarded `updateMany` (on `currentIndex` and the
  deadline). Keep that pattern, because it is what makes double-submits safe.
- **Coins:**
  - Only `applyCoinChange(tx, …)` in `src/services/coin.service.ts` may
    change a balance, and always inside `prisma.$transaction`.
  - It writes the `CoinTransaction` ledger row (`balanceAfter`) and refuses
    overdrafts atomically.
  - `(reason, refId)` is unique, so pass the attempt or order id as `refId`.
    Phase 4 note discounts use `NOTE_DISCOUNT` with the order id.
- **Tests** simulate time by editing rows (`questionDeadline` in the past,
  `dayKey` set to an old date) instead of faking clocks.
- **Quiz builder:** every rule about *which* quiz, questions, count, timing,
  pass mark, coins and readiness lives in `src/services/quizBuilder.service.ts`.
  The admin builder (`adminQuizBuilder.controller.ts`, live `/quizzes/pool`
  and `/quizzes/preview`), the student engine and `quizAvailability.service.ts`
  all reuse it, so never duplicate a rule.
  - Automatic chapter quizzes use only MCQs with `useInQuiz`. They can be
    switched off site-wide (`quiz.autoChapterQuizzes`) or per chapter
    (`Chapter.autoQuiz`).
  - Custom quizzes (`Quiz`) span any chapters of **one medium + class**.
    Null overrides mean "use the global setting".
  - Attempts snapshot `secondsPerQuestion`, `passMark`, `coinsPerPass`,
    `answerReveal`, `optionOrders` and `quizTitle`. `QuizAttempt.chapterId`
    is null for multi-chapter quizzes, and `quizId` is null for automatic
    ones (and becomes null when a quiz is deleted).
  - `AnswerRecord.optionIndex` is always the **original** option index.
    Shuffling is display-only.
- **Admin quiz reports** (`src/services/quizReport.service.ts`,
  `/api/admin/quiz/attempts|attempts/:id|stats`) are read-only. They call
  `expireAllStaleAttempts()` first so statuses are current. Answers are read
  from the attempt's `answers` JSON, so a question deleted later shows as
  `question: null` rather than breaking the report. Pass rate counts finished
  (PASSED/FAILED) attempts only.

### Notes & payments backend (Phase 4, built)
- **Code:**
  - `src/services/order.service.ts`: pricing, orders, grant, cancel, reconcile
  - `src/services/razorpay.service.ts`: REST client and HMAC checks
  - controllers: `notes`, `payments`, `adminNotes`
- **Unlock rule (never break this):** `NoteAccess` is created **only** by
  `grantOrder()`, which is reached from one of:
  - a verified checkout (signature, **and** the payment fetched from Razorpay
    as `captured` with the exact amount)
  - the signed webhook
  - admin reconcile
  - a 100%-coin order
  - or an admin manual grant
  Nothing client-side ever unlocks a note.
- **`grantOrder` is idempotent** (a guarded `updateMany` on status). Verify
  and webhook may both run, in either order.
- **Coins are held at order creation** (`NOTE_DISCOUNT`, refId = order id)
  and refunded by `cancelOrder` (`NOTE_DISCOUNT_REFUND`). Stale orders
  (30 min) are cancelled lazily.
- **One open order per student and note.** `createOrder` runs in one transaction
  that first locks the student's row (`tx.user.update`, a no-op increment). An open
  order with the same price and coins is **reused** (same Razorpay order, so Razorpay
  takes one payment); only a different price or coin choice cancels and replaces it.
  Never call Razorpay inside that transaction.
- **Access rows are created with `createMany({ skipDuplicates: true })`**, never a
  plain create or upsert, so two confirmations at once can't roll back a paid order.
  A PAID order that unlocked nothing is a duplicate: `refundDuplicate()` refunds it
  through Razorpay (REFUNDED, coins back); if that fails, admin Reconcile retries it.
- **Refunds:** `markRefunded()` (PAID → REFUNDED, removes that order's access,
  returns held coins from the ledger) is used by duplicate refunds and by the
  `refund.processed` / `payment.refunded` webhook (full refunds only).
- **Capture:** authorized payments are captured by us (`captureRazorpayPayment`),
  only when amount AND currency match. The dashboard's auto-capture setting
  doesn't matter.
- **Stale orders ask Razorpay first** (`settleFromRazorpay`): paid → confirmed,
  not cancelled. Paid after a cancel → coins taken again
  (`NOTE_DISCOUNT_REAPPLIED`), or flagged if already spent.
- **The webhook route is registered in `app.ts` BEFORE `express.json()`**,
  with `express.raw()`, because the HMAC needs the exact bytes. Keep it there.
- **Note PDFs:** only in the **private** bucket (`visibility: "private"`),
  uploaded via presigned PUT, then `POST /admin/notes/:id/file` HEAD-checks
  them. Downloads are presigned GETs from `GET /api/notes/:id/download`.
- **Tests** use `tests/fakeRazorpay.ts`, a real HTTP server on port 4599
  (`RAZORPAY_API_BASE` in `vitest.config.ts`). Add fake endpoints there
  rather than mocking fetch.

### Static pages & FAQ backend (Phase 5, built)
- **Models:** `Page` (slugs are fixed in `src/services/pages.service.ts`
  `PAGE_SLUGS`), `FaqItem` and `NewsLink` (home page "Latest news", http(s)
  links only, no seed: the client picks sources). Public routes under
  `/api/content` (`/news` = active links in order); admin routes under
  `/api/admin/pages`, `/api/admin/faq` and `/api/admin/news`.
- **Tokens:** page and FAQ text may contain `{{tokens}}` (`PAGE_TOKEN_NAMES`),
  filled from live settings at read time by `renderTokens()`.
  - Values are escaped in HTML and left raw in plain-text FAQ questions.
  - When a setting that appears in public text is added, add its token there.
- **Draft copy** lives in `prisma/seed-data/pages.ts`. It is seeded
  unpublished and never overwrites pages that already exist. The legal text
  must match how the code actually behaves (coins, 30-minute order
  cancellation, quiz pause rule, refunds). If you change that behaviour,
  update the drafts and flag it to the owner.

### Production (Phase 6, backend ready; see `DEPLOY.md`)
- **Domain:** `myclasscourse.in` → VPS `91.108.111.237`. Student site
  `https://myclasscourse.in` (`www` redirects to it), admin
  `https://admin.myclasscourse.in`, API `https://api.myclasscourse.in`.
- **Deploy = push to `main`.** `.github/workflows/deploy.yml` builds images in
  GitHub Actions → GHCR, the VPS (`/var/www/classcourse`, shared with other
  apps) only pulls them via `deploy/deploy.sh <tag> <services>` and
  `docker-compose.prod.yml`. Never build on the VPS. The API deploys first,
  because the student site's `next build` prerenders from the live API (with
  the API down that build fails; the readers' `cacheLife("seconds")` fallbacks
  can't be prerendered). Host ports (127.0.0.1): API 4150, site 3100, admin
  3101; nginx + certbot in front (`deploy/nginx/classcourse.conf`). Next apps
  use `output: "standalone"`. Server-only files: root `.env` and
  `backend/.env` (never committed).
- `src/config/env.ts` exports `envSchema`.
  - In production it **refuses** `CORS_ORIGIN=*`, a short JWT secret, a
    localhost `FRONTEND_URL`, or an overridden `RAZORPAY_API_BASE`.
  - `CORS_ORIGIN` is a comma-separated list parsed into exact origins.
  - `TRUST_PROXY` must match the number of reverse proxies.
- `src/server.ts`: graceful SIGTERM shutdown plus `startMaintenance()`
  (`src/services/maintenance.service.ts`), a 5-minute sweep of stale orders.
  Keep maintenance jobs idempotent and also applied lazily, because only one
  API instance is assumed.
- Health: `/health` (liveness) and `/health/ready` (database). The Docker
  healthcheck uses `/health/ready`.
- **docker-compose:**
  - every service has `mem_limit` plus a heap cap
  - ports bind to `${BIND_ADDRESS:-127.0.0.1}`
  - Postgres credentials come from the root `.env`
  - one-off tasks run via `docker compose run --rm migrate npm run <seed|create-admin>`
  - Run the `deploy-preflight` skill before any deploy.

### Domain rules
- **Previous / Next Chapter buttons are MANDATORY** at the bottom of every
  chapter page. They follow subject order across parts. Disable Previous on
  the first chapter and Next on the last.
- On the class page, each subject opens a **dropdown/accordion of its chapters**.
- Quiz config lives in the `Setting` table, never in code. The defaults are
  10 questions, 10 s per question, pass ≥ 7, daily limit 10.
- The quiz timer is **enforced on the server** (a per-question deadline, and a
  late answer counts as wrong). A paused quiz can be resumed only on the same
  day. The day ends at **00:00 Asia/Kolkata**, and after that the attempt is
  `EXPIRED`.
- Coins are awarded **only by the server** when a student passes. Every change
  is written to the append-only `CoinTransaction` ledger inside a Prisma
  transaction.
- A premium note unlocks **only after server-side Razorpay verification**
  (signature check plus webhook). PDFs are served through short-lived signed
  URLs, never a public link.
- Never show a phone number, WhatsApp number or address. Contact is email only.

### UI / content rules
- Must render **Assamese script** correctly. Font stack is `Noto Sans Bengali`
  (covers ৰ, ৱ) with a Latin UI font. Store both `name` and `nativeName` for
  mediums and subjects.
- **Mobile-first.** Most students use phones.
- "3D" look: layered shadows and depth on cards and buttons. The exact meaning
  is PENDING, so keep it in design tokens that are easy to change.
- Take inspiration from dailyassam.com only. Do not copy its design, code or
  content. Keep it simple enough for a Class 1 student.
- Content pages (medium/class/subject/chapter) use SSR/ISR with proper metadata for SEO.

### Development order (hard rule)
- Build **phase by phase** (see `task.md`). Inside each phase the order is
  **backend → admin → frontend**:
  1. Finish the phase's backend (models, migration, routes, tsc passing).
  2. Then build the admin screens that manage that data.
  3. Then build the student-facing frontend.
- Do not start the next phase until the current one is done and ticked off in `task.md`.
- **Stop after each phase.** Report what was built and tested, then wait for
  the user's go-ahead before starting the next phase.
- A phase's backend is "done" only when:
  - migrations are applied
  - `npx tsc --noEmit` passes
  - `npm test` is green, with new tests for the phase
  - `task.md` is ticked

### Settings (admin-configurable config) — `backend/src/services/settings.service.ts`
- All runtime configuration lives in the `Setting` table, one row per group,
  and is resolved in this order: **database row → env fallback → defaults**.
  The groups are:
  - `quiz`, `coins`, `social`, `contact`, `site`
  - `storage` (R2) and `smtp`, which have secrets
- **To add a group:**
  1. Add a Zod schema and an entry in the `SETTINGS` registry. The entry
     declares `defaults`, an optional `fromEnv`, `secretFields`,
     `secretBoundTo`, `genericAdminEdit` and `isPublic`.
  2. If the group needs no live test, it automatically gets
     `GET/PUT/DELETE /api/admin/settings/:key`. PUT accepts partial updates.
  3. Groups that need a connection test (storage, smtp, and later razorpay)
     get dedicated routes that test before saving.
- Read values with `getSetting(key)` or `requireSetting(key)`. Never read
  `process.env` directly for anything a setting covers.
- Secret fields are encrypted with AES-256-GCM (`utils/crypto.ts`, key
  `SETTINGS_ENCRYPTION_KEY`). They are masked in every response
  (`<field>Masked`, `has<Field>`). A blank value on save keeps the stored
  secret, but changing the field it is bound to (e.g. the access key ID or
  SMTP user) requires re-entering it.
- `GET /api/settings/public` returns only `isPublic` groups that have no
  secrets (quiz, coins, social, contact, site).
- The value cache is per process and cleared on save. Services that hold
  clients (the S3 client, the SMTP transport) rebuild them when the config
  fingerprint changes, so no restart is needed.

### Email — SMTP (configurable from admin)
- `backend/src/services/mail.service.ts` (nodemailer) is the only place that
  sends email. Use `sendMail({ to, subject, html, text })`.
- Templates live in `backend/src/emails/` and use `layout.ts` (inline styles
  only). Intention-named wrappers live in `src/utils/mailer.ts`, e.g.
  `sendPasswordResetEmail`. Controllers call the wrappers.
- The config is the `smtp` setting:
  - `host`, `port`, `secure`, `user`, `password` (secret)
  - `fromName`, `fromEmail`, `replyTo`
  - `SMTP_*` env vars are the fallback.
- If SMTP is unconfigured, dev and test log the email to the console, and
  production throws a 503.
- `sendPasswordResetEmail` never throws. It logs instead, so forgot-password
  can't reveal whether an email is registered.
- Admin API:
  - `GET/PUT/DELETE /api/admin/settings/smtp`. PUT runs `verify()` and
    refuses to save if it fails.
  - `POST /api/admin/settings/smtp/test` (form plus optional `to`; it sends a
    real test email)
  - `POST /api/admin/settings/smtp/test-active`
  - The recipient defaults to the logged-in admin.
- Email links use the `site.frontendUrl` setting, which defaults to `FRONTEND_URL`.

### File storage — Cloudflare R2 (configurable from admin)
- All files (premium PDFs, images) go to **Cloudflare R2** through the
  S3-compatible API (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`,
  endpoint `https://<accountId>.r2.cloudflarestorage.com`, region `auto`).
- The R2 config is stored in the `Setting` table under key `storage` and
  edited from **Admin → Settings → Storage** (`admin/src/app/(panel)/settings/storage`). It holds:
  - `endpoint` (`https://<account-id>.r2.cloudflarestorage.com`)
  - `bucket` (public: images) and `privateBucket?` (premium notes)
  - `accessKeyId`, `secretAccessKey`
  - `publicUrl?`
  - `signedUrlTtlSeconds`
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` and
  `R2_PUBLIC_URL` in `backend/.env` are only a fallback for when no DB setting
  exists. The admin page shows which source is active, and "Reset to .env"
  deletes the DB row.
- Implementation: `backend/src/services/storage.service.ts`. Use its helpers
  (`uploadObject`, `deleteObject`, `getSignedDownloadUrl`,
  `getSignedUploadUrl`, `getPublicUrl`, `hasPrivateBucket`) everywhere. Never
  construct an `S3Client` anywhere else.
- The helpers take a trailing `visibility: "public" | "private"` argument,
  default `"public"`. **Premium notes must always use `"private"`.** It throws
  a 503 while `privateBucket` is unset, and Phase 4 must refuse to publish
  paid notes until `hasPrivateBucket()` is true.
- The storage test also round-trips the private bucket when one is set. A PUT
  without `privateBucket` keeps the current value, so the existing admin page
  doesn't wipe it; `""` clears it.
- Admin API: `GET/PUT/DELETE /api/admin/settings/storage`,
  `POST /api/admin/settings/storage/test` (tests the form, doesn't save) and
  `POST /api/admin/settings/storage/test-active`. PUT runs a live
  write/read/delete round trip and refuses to save if it fails.
- Secrets (`secretAccessKey`) are **encrypted at rest** with AES-256-GCM,
  using `SETTINGS_ENCRYPTION_KEY` from `env.ts`.
- Secrets are **never returned** by the API. The admin form shows a masked
  value, and a blank field means "keep current".
- The storage service builds its S3 client from the current setting and
  rebuilds it when the setting changes. There is no restart and no hardcoded
  bucket.
- The admin has a **"Test connection"** button (a HeadBucket check) before
  saving.
- Premium PDFs are private objects in `privateBucket`, downloaded only through
  presigned GET URLs. ⚠ The main bucket (`classcourse`) has **public access
  enabled** (r2.dev URL), so never put notes in it.

### Local development
- Postgres runs in Docker (`docker compose up -d postgres`). The compose
  project name is `classcourse`, the DB is `classcourse_db`, and the host port
  is **5440** (root `.env`). Ports 5432, 5433 and 3000 are taken by other
  projects on this machine.
- Backend dev: `cd backend && npm run dev` runs on **:4000**, and
  `backend/.env` points at `localhost:5440`.
- Full stack in Docker: `docker compose up --build` puts the API on host
  :4000. Inside the container the API listens on 3000, because compose
  forces `PORT: 3000`.
- Frontend: `npm run dev -- -p 3100`. Admin: the user usually already has it
  running. It is currently on **:3002**, because port 3001 belongs to another
  project (`eduplatform/apps/sa-panel`); never touch that one. Next allows only
  one dev server per app folder, so check `lsof` before starting one. Both
  use `NEXT_PUBLIC_API_URL=http://localhost:4000`.
- **Tests:** `cd backend && npm test`. It creates and migrates
  `classcourse_db_test` (never the dev DB), then runs vitest + supertest in
  `backend/tests/`.
  - Tests import the Express app from `src/app.ts`. `src/server.ts` only
    calls `listen`.
  - Each test file starts from an empty DB (`tests/setup.ts`).
  - `tests/helpers.ts` has `createUserAndLogin(role)`.
  - SMTP tests run a local `smtp-server`. Live R2 tests run only when `R2_*`
    env vars exist.
  - Rate limiters are off when `NODE_ENV=test` (`rateLimitSwitch`);
    `tests/rateLimit.test.ts` switches them on and calls `resetRateLimits()`.
- **Rate limits** (`src/middleware/rateLimiter.ts`, all built with `limiter()`;
  in memory, one API instance assumed; IP keys need `TRUST_PROXY` right):
  - login: 20 **failed** per 15 min per IP + 5 failed per email per 15 min
    (successful sign-ins never count: a class shares one IP on school Wi-Fi /
    mobile NAT, so tight limits follow the account, not the IP)
  - sign-up 15/hour per IP; forgot password 10/15 min per IP + 3/hour per
    email; reset 10/15 min; email code 20/15 min; contact 5/hour
  - quiz 90/min and payments 30/min per user; search 60/min; check answer 40/min
  - whole `/api` backstop 600/min per IP (`/health` is outside it; the
    Razorpay webhook is registered before it)
  - A new public endpoint that sends email or does heavy work gets its own
    limiter here.
  - `tests/setup.ts` turns HTTP keep-alive off: with Node 19+ and supertest's
    per-request servers it caused random "socket hang up" failures.

### Admin UI (shadcn, sidebar-07)
- **Setup:** shadcn is initialised (`admin/components.json`: Radix base, Nova
  preset, Lucide icons). Add components with
  `cd admin && npx shadcn@latest add <name>`.
- **Shell:** the user's chosen block, **`sidebar-07`**, restyled with the
  brand (dark-brown sidebar, amber active marker, the client's logo:
  `LogoFull` when open, `LogoMark` on the collapsed rail, both in
  `components/admin/logo-mark.tsx`).
  - `src/app/(panel)/layout.tsx`: ADMIN guard, `SidebarProvider`, header
    with trigger and breadcrumb
  - `src/components/app-sidebar.tsx`, `nav-main.tsx`, `nav-user.tsx` (real
    admin, theme switch, logout that revokes the refresh token)
  - The block's `app/dashboard/page.tsx`, team switcher and projects demo
    were removed.
- **Navigation:** `src/components/admin/nav.ts` is the single source for
  the sidebar and the breadcrumbs. **Each phase adds its sections there**, so
  never link to pages that don't exist yet.
- **Theme:** `next-themes` (System/Light/Dark; dark = `.dark` class). The
  brand tokens live in `src/app/globals.css` and use **the same colour values as
  the student site** (`frontend/src/app/globals.css`); keep the two in step.
  Amber buttons have ink text; amber *text* uses `text-brand-amber-text`
  (never `text-primary`: plain amber on white fails contrast). Admin
  `--success` is one shade darker (badges sit on a green tint).
  Fonts: `font-heading` (Bricolage Grotesque) and `font-sans` (Geist).
- **Reuse rather than re-invent:**
  - `apiJson()` / `ApiError` / `logout()` in `src/lib/api.ts`
  - `useAdmin()` (`components/admin/session.tsx`)
  - `PageHeader`
  - `Field` / `SecretInput` (with the show/hide toggle), `SourceBadge`,
    `TestResult` (`components/admin/settings/`)
  - `pressable` / `actionButton` / `inputClass` / `formCard`
    (`components/admin/styles.ts`; 40 px controls, because Nova's 32 px
    default is too small for touch)
  - `toast` from `sonner` for success messages
  - `useConfirm()` (`components/admin/confirm.tsx`): an awaitable dialog. Never
    use `window.confirm`.
  - `ReorderButtons` (↑/↓, chosen over drag-and-drop for touch and keyboard)
    plus `move()` from `src/lib/catalog.ts` for optimistic reorders
  - `RichTextEditor` / `RichView` (`components/admin/editor/`) for any HTML
    field. Its toolbar only offers what the backend sanitiser allows; key it
    by record so it reloads content. The `.rich` class in `globals.css`
    styles stored HTML.
  - `uploadImage(file)` (`src/lib/upload.ts`): presigned PUT to the public
    bucket. It **needs the bucket CORS rule** (Settings → Storage shows it).
  - Chapter content lives in `components/admin/content/*`; types are in
    `src/lib/content.ts`.
  - Quiz builder UI: `components/admin/quiz-builder/` (`QuizBuilder`,
    `PreviewDialog`, `ChapterQuizPanel`) and the types and form helpers in
    `src/lib/quiz.ts`. Pickers update through functional `setForm`, because
    quick clicks would otherwise lose picks.
  - Builder UX rule: the four main steps (name, chapters, questions, publish)
    stay short. Every optional control goes under **More options** (closed
    unless the quiz uses one) and shows "Default: … · Change" through
    `DefaultNumber`, never a faded placeholder. Keep the wording plain (no
    "pool", "override" or "slug").
  - List pages whose filters live in the URL (quiz reports) use
    `useFilterParams()` / `ScopeFilters` from `components/admin/quiz/filters.tsx`.
    Changing a filter resets `page`; wrap the page in `<Suspense>` because it
    reads `useSearchParams`.
  - Dialogs reset their form when opened via the "previous target" render
    pattern (see `subject-dialog.tsx`), not `useEffect`, because of the
    set-state-in-effect lint rule.
- **Dashboard** (`(panel)/dashboard/page.tsx`) reads one endpoint,
  `GET /api/admin/stats?days=7|30|90` (`controllers/adminStats.controller.ts`):
  figures vs the previous period, daily series by IST day, top chapters/notes,
  latest orders/students, content totals and an `attention` list (only real
  problems: failed refunds, payments/email/storage not set up, legal pages).
  Revenue counts PAID orders only. Charts are the dependency-free
  `components/admin/dashboard/bar-chart.tsx` (one series, `--chart-bar` colour,
  hover readout, hidden data table). Add new figures to the endpoint, not as
  extra calls from the page.
- **Page width (one standard):** `(panel)/layout.tsx` wraps every page in
  the same container: full width, capped at 1600 px, with gutters of
  16/24/32 px. Page roots are just `<div className="space-y-6">`. Never add
  `mx-auto max-w-*` to a page; limit only long text (descriptions, prose).
- **Links (slugs) are automatic.** Admins never type a slug. Use
  `LinkPreview` (`components/admin/catalog/link-preview.tsx`): the link is
  made from the name on create, stays fixed on rename, and "Change link"
  sits tucked away for typo fixes. The backend falls back to `medium-N` /
  `subject-N` for Assamese-only names, suffixes clashes, refuses duplicate
  names in plain words, and moves an automatic `chapter-N` link when the
  number changes. Never show the word "slug" or raw paths in the UI. Use
  "View on site ↗" (`siteLink()` in `src/lib/site.ts`,
  `NEXT_PUBLIC_SITE_URL`).
- Settings text says "server values / configuration file", never ".env".
- `src/hooks/use-mobile.ts` was rewritten with `useSyncExternalStore`;
  shadcn's version broke the `react-hooks/set-state-in-effect` lint rule.
- **Verify UI** with device-emulated screenshots (puppeteer-core plus the
  installed Chrome, in the scratchpad) at 390 and 1440 px, light and dark.
  Successful test logins don't count toward the login limit; repeated failed
  ones do (20 per IP / 5 per email per 15 min, in memory). Touching
  `backend/src/server.ts` restarts the dev server and resets the counters.
- **Brand:** the client mock's amber `#f5a623` / cream `#fff7e8` / ink
  `#3a2a00` / brown `#2e2000`, shared with the student site (the old navy +
  indigo look was replaced on 29 Oct 2026).
- **Logo files (client's, both apps):** `public/brand/` — `class-course-logo-original.svg`
  (as supplied, 164 KB, embedded images), `logo.svg` (same, frame trimmed to the
  artwork), `logo.webp` (18 KB render used on pages), `logo-mark.webp`/`.png`
  (square mark). The landscape logo is **white**: use it only on amber/brown
  (site header and footer, admin sidebar and login panel); on light surfaces use
  `LogoMark` (the square mark). Favicon = `src/app/icon.png` + `apple-icon.png`. Display font Bricolage Grotesque (currently loaded
  in `admin/src/app/login/layout.tsx`); body font Geist.
- The login page (`admin/src/app/login/page.tsx`) is the reference for the
  look: layered "3D" cards, a pressable button, 16 px inputs (no iOS zoom),
  dark-mode support, and `motion-safe` animation.

### Student frontend (`frontend/`)
- **Run:** `cd frontend && npx next dev -p 3100`.
- Next 16 with **Cache Components** (`cacheComponents: true`). **Read
  `frontend/node_modules/next/dist/docs/` before using a Next API** — it
  differs from older versions.
- **Server data:** add cached readers to `src/lib/server-api.ts`:
  - `'use cache'` + `cacheLife(...)` + `cacheTag("settings"|"pages"|"catalog")`
  - catch errors and fall back (with `cacheLife("seconds")`)
  - never read the clock or randomness during prerender without caching it
    (see `getCurrentYear`)
  - wrap request-time things (searchParams, auth) in `<Suspense>`
- **Client data:** `apiJson()` (with auth and token refresh), `publicJson()`
  (no auth), `logout()` in `src/lib/api.ts`. Login state:
  `useSignedIn()` / `useMe()` in `components/site/account-menu.tsx`. Tokens
  fire the `cc-auth` event so every component updates.
- **Look (client mock, `docs/design/home-page-mock.html`, review in `plan.md §9b`):**
  - amber/cream palette + warm dark mode, all tokens in `src/app/globals.css`.
    Text on amber is **ink** (`text-brand-ink`), never white (2:1). Amber
    text/links use `text-brand-amber-text`, not `text-primary` (amber on cream fails).
  - corner radii are the mock's: `rounded-lg` 10 (logo, badges, socials),
    `rounded-xl` 14 (cards, main buttons), `rounded-2xl` 16 (class tiles,
    about), `rounded-3xl` 18 (reward/quiz boxes), `rounded-4xl` 20 (Start Quiz);
    news/video cards `rounded-[15px]`, small buttons `rounded-[12px]`
  - use `card-3d` (+ `lift` for links) for cards, `press-3d` for primary buttons
    (it sets its own gradient + ink text), `scroll-row` / `ScrollRow` for sideways rows
  - **no visible scrollbars**: `scroll-row` hides them; card rows use `ScrollRow`
    (arrow buttons for mouse users, hidden at the ends); rows of chips/buttons
    add `sm:flex-wrap` so they wrap on wider screens instead of scrolling
  - video cards are all the same size (16:9 frame; a Short sits upright on a
    blurred copy of its picture; titles reserve two lines). `upright` is only
    for rows where every video is a Short
  - reuse the kit in `src/components/kit/` (SectionTitle, ClassTile, RowCard,
    NoteCard, VideoCard, NewsCard, Coin3D, LogoMark); preview it at `/kit` (dev only)
  - icons are Lucide/SVG, never emoji; headings `font-heading`; mark Assamese
    text with `lang="as"` (+ `as-text` for body-size Assamese)
  - inputs `h-12 text-base` (no iOS zoom); tap targets ≥ 44 px in content
  - the chosen medium is the `cc_medium` cookie (`src/lib/medium.ts`)
  - keep it simple for Class 1 students
- **Page width:** use one shared container for every page (`max-w-7xl`,
  gutters `px-4 sm:px-6 lg:px-8`), the same idea as the admin. Don't give
  pages their own widths. It is `<Container>` (`components/site/container.tsx`).
- **Catalog routes** (`app/[medium]/[classSlug]/[subject]/[chapter]`):
  - the default export is sync and renders `<Suspense>`; an inner `*Content`
    component awaits `params` (so unlisted URLs still get an instant shell)
  - `generateStaticParams` lists the **full path** from `src/lib/catalog-params.ts`
    (pages, not layouts, so parents don't pass params down) with a `__none__`
    placeholder if the API is down at build
  - readers return `null` on 404 → `notFound()` (renders with `noindex`);
    other API errors throw → `app/error.tsx`
  - link with `catalogHref()`, label chapters with `chapterName()` /
    `isPlaceholderTitle()` from `src/lib/catalog.ts`
  - chapter page parts live in `components/chapter/` (QaList, McqPractice,
    ChapterSection, JumpBar). Stored HTML renders as-is inside `.rich`
    (sanitised on write); MCQ practice only ever learns the answer from
    `POST /api/catalog/questions/:id/check`
  - `app/sitemap.ts` / `app/robots.ts` use the same cached readers
- **Quiz & profile (client-rendered, login required):** `/quiz/[attemptId]`
  (`components/quiz/quiz-runner.tsx`) and `/profile`. Types and helpers in
  `src/lib/quiz.ts` (`startQuiz`, `pauseOnLeave` = keepalive pause,
  `attemptLabel`). The runner follows the server's attempt state and never
  decides anything itself. Guard login by reading `getAccessToken()` in an
  effect (the `useSignedIn` hook is `false` on the first render). After a
  balance change call `announceCoinsChanged()` (`account-menu.tsx`) so every
  coin display reloads.
- **Notes & checkout (client):** `src/lib/notes.ts` (`useOwnedNotes`,
  `downloadNote`, `loadRazorpay`, `announceNotesChanged`), components in
  `components/notes/` (`NoteList`, `NoteActions`, `BuyDialog`, `NotesStore`;
  `placeLine` is a plain module so server components can call it). The
  browser never unlocks a note: it waits for the server's PAID (verify, or
  polling while PENDING). `BuyDialog` hides itself while Razorpay's window is open
  (`razorpayOpen`): a modal Radix dialog sets `pointer-events: none` and traps
  focus, which made Razorpay's window unclickable. Do the same for any other
  third-party popup opened from a dialog. Without Razorpay keys, browser tests stub
  `checkout.razorpay.com` and the payment endpoints with request interception.
- **Page weight:** the header's search, medium switcher and menu (Radix) and
  the buy window load on first tap (`components/site/lazy-header.tsx`,
  `next/dynamic`). Keep new heavy UI out of the first load the same way.
  Lighthouse mobile medians are 90–92; re-check after big changes.
- **Static pages:** `components/pages/static-page.tsx` + one tiny page file per
  slug; `/faq` has its own page. About = hero + feature cards + the owner's text
  + call to action; legal pages = hero ("Last updated") + article with an
  automatic "On this page" list (h2/h3 get ids) + other policies; Contact = the
  form (`components/pages/contact-form.tsx`, React Hook Form + Zod, rules in
  `src/lib/contact.ts` mirroring the backend) beside the email card. The form
  works even when the contact page text isn't published.
- **Contact messages:** `POST /api/content/contact` (`contactLimiter` 5/hour,
  hidden `website` spam trap, optional sign-in links the message to the
  student). The message is saved and answered first; the email to the
  `contact` setting's address goes out afterwards (`setImmediate`, reply-to =
  the student) and its result is stored in `emailNote`. Admin → Messages
  (`/api/admin/messages`) reads them; new ones show on the dashboard. A new top-level route also needs its word in
  the backend's `RESERVED_TOP_LEVEL`.
- **Home = the client's mock** (`docs/design/home-page-mock.html`): keep its
  order, wording and card styles. The quiz box title is "Daily Chapter Quiz"; the about
  text's "from Class X to Class Y" is worked out from the mediums' class lists. Sections never disappear: no admin content
  → a "coming soon" placeholder (`components/home/placeholders.tsx`) or the
  mock's news sources (`DEFAULT_NEWS`). Footer/menu links come from
  `siteLinks()` (`src/lib/site-links.ts`); unpublished pages say "Coming soon".
- Overflow checks: compare `document.documentElement.scrollWidth` with the
  **device** width; mobile emulation widens `innerWidth` to fit wide content.
  `.scroll-row` must stay `position: relative` (it clips sr-only text in cards).
- Browser tests: Next keeps hidden copies of earlier screens in the DOM, so
  match **visible** elements only (`offsetParent !== null`), not page text.
- **Videos & news pages:** `/videos` (`components/media/video-browser.tsx`: medium +
  class chips, a Shorts row and a lessons grid with "Load more", from public
  `GET /api/catalog/videos?medium&classSlug&format&page`) and `/news` (grid; falls
  back to `DEFAULT_NEWS`). `VideoCard` / `NewsCard` take `fluid` to fill a grid cell;
  news cards show `NewsLink.imageUrl` (admin upload) or an amber panel.
- **Start Quiz** (home) opens `components/quiz/quiz-picker.tsx` (lazy, like the
  header panels): medium → class → every ready quiz from public
  `GET /api/catalog/quiz-picker?medium&classSlug` (`classQuizCatalog()` in
  `quizAvailability.service.ts`, which reuses `availableQuizzes()` so readiness
  rules stay in one place). Guests get a sign-in link back to `/#start-quiz`.
- **Demo quizzes (dev only):** `npm run seed:demo` (backend) fills 50 chapters with
  12 marked MCQs each + 2 class tests; `npm run seed:demo -- --remove` deletes only
  those. It refuses to run in production.
- **Auth pages** take `?next=`. Only same-site paths are allowed (`safeNext`).
- **Sign-up needs an email code.** `/register` (name, email, phone, password) creates the
  student with `emailVerified: false` and emails a 6-digit code; no tokens until
  `POST /api/auth/verify-email`. Login of an unverified account answers 403 with
  `code: "EMAIL_NOT_VERIFIED"` (AppError's optional third argument; the frontend's
  `ApiError.code`). Code rules live only in `backend/src/services/emailVerification.service.ts`;
  the UI step is `components/auth/verify-code.tsx`. Accounts made any other way
  (seed, create-admin, tests) default to verified. Phone is a 10-digit Indian mobile
  (`phoneSchema` in `auth.validation.ts`), shown to admins only; the "no phone number"
  rule is about the site's own contact details.

### Roles
- `User.role` is `STUDENT | ADMIN` (default STUDENT).
- Protect admin routes with `authenticate` + `requireRole("ADMIN")`
  (`backend/src/middleware/role.middleware.ts`). Every route under
  `/api/admin` (`backend/src/routes/admin.routes.ts`) already has this applied
  at router level. The role is read from the DB on each request, not from the
  JWT.
- Create or promote an admin with `cd backend && npm run create-admin -- <email> <password> [name]`.
- Dev admin: `npm run seed` creates the account in `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD` (`backend/.env`, git-ignored) if that email isn't
  registered. It never resets an existing password. In production it
  requires a password of 12+ characters.
- Admin app: every page in `admin/src/app/(panel)/` is guarded by
  `(panel)/layout.tsx` (it calls `/api/auth/me` and requires ADMIN). The
  sidebar nav lives there too, so add new admin pages to its `NAV` array.

### Blueprint MCP tools in this project
Always **dry-run** a tool first, and apply it only if the output follows the
rules in this file.
- **Not used:**
  - `inject_mail_provider`: Resend-only. We use SMTP.
  - `inject_prisma_seed`: generates dummy products.
  - `inject_prisma_model`: no enums, `@@unique` or `@@index`, so the schema is
    written by hand.
  - `inject_rbac_middleware`: `requireRole` is already applied to all of
    `/api/admin`.
  - `inject_storage_service`: R2 is already built.
- **Require a Blueprint Pro license** (they returned license errors):
  `inject_api_tests`, `inject_rate_limiter`, `inject_transaction` and
  `inject_payment_webhook`. All four were written by hand.
- **Dry-run and rejected:** `inject_crud_controller` (Phase 1). It used
  per-route `try/catch` + `res.status(500)`, leaked `error.message`, did
  validation outside `validateBody`, and had cascading deletes. Hand-write
  controllers.
- `inject_payment_webhook` is Pro-gated too, so the Razorpay webhook was
  hand-written. For rate limits, transactions and payments, follow the
  existing patterns in `middleware/rateLimiter.ts`, `coin.service.ts` and
  `order.service.ts`.

---

# Blueprint Boilerplate — Base Rules

## Repo layout

This is a monorepo of **independent, standalone** apps — no npm/pnpm workspaces,
no shared root `node_modules`. Each app has its own `package.json`,
`node_modules`, and lockfile. Only work inside one app's folder at a time.

- `backend`  — Express + Prisma API (see Stack below)
- `admin`    — Next.js admin dashboard, consumes the backend API
- `frontend` — Next.js public-facing app, consumes the backend API
- `docker-compose.yml` (repo root) — orchestrates `backend` + Postgres

## Backend stack (backend)
- Runtime: Node.js 20.19+ / 22.12+ / 24+ (Prisma 7 requirement — do NOT downgrade to Node 18)
- Framework: Express 4 + TypeScript (CommonJS)
- ORM: Prisma 7 + PostgreSQL (Driver Adapter mode via prisma.config.ts)
Connection config: prisma.config.ts at backend root (NOT schema.prisma)
NEVER add url to schema.prisma — Prisma 7 removed this
- Auth: JWT short-lived access token (15m default) + opaque refresh token,
  rotated on every /api/auth/refresh call and stored in the `RefreshToken`
  table (row deleted = revoked). See backend/src/controllers/auth.controller.ts.
- Validation: Zod, applied via `validateBody` middleware on every route that
  accepts a body (backend/src/middleware/validate.middleware.ts)
- Env validation: backend/src/config/env.ts (Zod-parsed, fails fast on boot)
- Error handling: every controller uses `asyncHandler` + throws `AppError`;
  a single global handler in backend/src/middleware/error.middleware.ts
  formats the response — do NOT add per-route try/catch + res.status(500)
- Security: helmet + express-rate-limit (auth routes limited to 10 req/15min)
- Password hashing: bcrypt (NEVER bcryptjs)
- Connection: PrismaPg driver adapter with pg Pool

## Backend project structure (backend)
- Entry point:  src/server.ts (listen only) → src/app.ts (Express app)
- Services:     src/services/ (settings, storage, mail)
- Emails:       src/emails/ (templates)
- Tests:        tests/ (vitest + supertest; `npm test`)
- Controllers:  src/controllers/
- Routes:       src/routes/
- Middleware:   src/middleware/
- Validations:  src/validations/ (Zod schemas)
- Utils:        src/utils/ (jwt, password, mailer, AppError, asyncHandler)
- Config:       src/config/prisma.ts, src/config/env.ts
- Schema:       prisma/schema.prisma

## Critical Rules (backend)
- NEVER add url = env("DATABASE_URL") to schema.prisma
  in Prisma 7 — connection lives in prisma.config.ts only
- ALWAYS import prisma from "../config/prisma"
- ALWAYS import env from "../config/env" instead of reading process.env directly
- ALWAYS use bcrypt, NEVER bcryptjs
- ALWAYS use Zod for request validation, via validateBody() in the route file
- ALWAYS wrap async controllers in asyncHandler and throw AppError instead of
  manually catching and formatting error responses
- NEVER use raw SQL — always use Prisma client
- NEVER create a new PrismaClient() anywhere except src/config/prisma.ts
- Module system is CommonJS — use import/export syntax
  (TypeScript compiles to CJS)
- Prisma migrations must be generated with a real (or temporary Dockerized)
  Postgres and committed under prisma/migrations — never hand-write migration SQL

## Frontend apps (admin, frontend)
- Next.js App Router + TypeScript + Tailwind, scaffolded via create-next-app
- Each has `src/lib/auth.ts` (token storage) and `src/lib/api.ts` (fetch
  wrapper that attaches the access token and auto-rotates on a 401 via
  /api/auth/refresh) — reuse this pattern instead of inventing a new one
- Backend URL is read from `NEXT_PUBLIC_API_URL` (see `.env.local.example`
  in each app) — copy to `.env.local` and point it at the running backend
- `next.config.ts` pins `turbopack.root` to the app's own directory — keep
  this if you ever nest these apps deeper, otherwise Next may misdetect the
  project root from an unrelated lockfile elsewhere on disk

## Docker
- `backend/Dockerfile` — multi-stage (deps → build → slim runtime).
  `prisma generate` at build time needs a resolvable `DATABASE_URL`, so the
  build stage sets a placeholder value via `ENV` — this is NOT the runtime
  connection string, which comes from the container's real env at runtime.
- `docker-compose.yml` (repo root) — three services: `postgres`, `migrate`
  (one-shot `prisma migrate deploy`, runs the Dockerfile's `build` target
  since the production image strips the Prisma CLI), and `backend`, which
  has `depends_on: migrate: condition: service_completed_successfully` —
  it will not start against an unmigrated database. Admin and frontend are
  not containerized (Next dev/`next start` is normally run directly, not
  through Docker, for these boilerplate apps).
- First-time setup: `cp backend/.env.example backend/.env` and fill in a
  real `JWT_ACCESS_SECRET` (`DATABASE_URL` in that file is irrelevant for
  Docker — compose overrides it to point at the `postgres` service). Then
  `docker compose up --build` from the repo root does everything: builds
  images, starts Postgres, applies migrations, starts the API. Re-running
  it is idempotent — `migrate` just reports no pending migrations.
- If you're running more than one project reused from this boilerplate (or
  a local Postgres) at once, host ports collide since every copy defaults
  to 5432/3000. Copy the root `.env.example` to `.env` and set
  `POSTGRES_PORT` / `BACKEND_PORT` to free ports for that project — this
  `.env` is separate from `backend/.env` and only affects host port mapping.

## Blueprint Architect MCP Tool Order
When building a new feature in backend, use tools in this order:
1. inject_prisma_model       → add schema models first
2. inject_crud_controller    → generate CRUD from schema
3. inject_express_route      → wire up routes
4. inject_rbac_middleware    → protect routes by role
5. inject_auth_system        → already present (JWT + refresh rotation) — do not re-run
6. inject_env_validation     → already present (src/config/env.ts) — do not re-run
7. inject_global_error_handler → already present (src/middleware/error.middleware.ts) — do not re-run
8. inject_socket_service     → add real-time if needed
9. inject_redis_service      → add caching if needed
10. inject_payment_webhook   → add payments if needed
