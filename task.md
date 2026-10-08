# Class Course — Tasks

Legend: `[ ]` todo · `[x]` done · `[~]` in progress. The tag says which app:
`[backend]` `[frontend]` `[admin]` `[all]`.
See `plan.md` for design details. Do not build a PENDING value into the code.
Make it a setting or a placeholder instead.

**Order:** go phase by phase. Inside each phase, do all of **Backend**,
then **Admin**, then **Frontend**. Only start the next phase when the
current one is fully ticked.

## Phase 0 — Foundations
### Setup
- [x] Scaffold backend, frontend and admin from the Blueprint boilerplate
- [x] Docker Postgres: compose project `classcourse`, DB `classcourse_db`, host port 5440. Existing migrations applied.
- [x] `.env` files: root (ports), `backend/.env` (port 4000, DB, JWT secret), `frontend/.env.local` and `admin/.env.local` (API at :4000)
- [x] Checked that the backend connects to Docker Postgres (register → DB insert)
- [ ] `git init` and make the first commit

### Backend
- [x] Add `role` (`STUDENT|ADMIN`) to `User`. Role is returned by login and `/me`, and checked from the DB rather than the JWT.
- [x] RBAC middleware `requireRole('ADMIN')` (`src/middleware/role.middleware.ts`), applied to all of `/api/admin`
- [x] `Setting` model (key/value JSON)
- [x] Settings registry `src/services/settings.service.ts`:
  - [x] groups: quiz, coins (10/pass, 10 paise per coin, max 50%), social, contact, site, storage, smtp
  - [x] resolution order: DB → env → defaults
  - [x] encrypted and masked secrets
  - [x] storage refactored onto it
- [x] `SETTINGS_ENCRYPTION_KEY` in `env.ts`, plus `src/utils/crypto.ts` (AES-256-GCM encrypt/decrypt/mask)
- [x] R2 credentials in `backend/.env` tested live: HeadBucket, put, get, presigned GET/PUT, public URL, delete all pass
- [x] **Cloudflare R2 storage service**: `inject_storage_service`, adapted to R2 (S3 client with the R2 endpoint, region `auto`). Config comes from the `storage` Setting, with `R2_*` env as fallback. The client is rebuilt when the setting changes.
- [x] Storage settings routes (admin):
  - [x] GET returns the config with the secret masked
  - [x] PUT validates with Zod and encrypts the secret. A blank secret keeps the current one.
  - [x] POST `/test` runs a full HeadBucket/put/get/delete round trip. PUT also runs it and refuses to save on failure. `test-active` and DELETE (reset to env) are included.
- [x] Generic admin settings routes `GET /api/admin/settings`, `GET|PUT|DELETE /api/admin/settings/:key` (partial PUT), and a public `GET /api/settings/public` (no secrets)
- [x] **Private notes bucket**: optional `privateBucket` in storage settings; `visibility` argument on the storage helpers; `hasPrivateBucket()`; the round-trip test covers it
- [x] **Email (SMTP), admin-configurable**:
  - [x] nodemailer mail service with a transport cache
  - [x] `SMTP_*` env fallback
  - [x] routes: GET/PUT (verify before save)/DELETE, `/test` (sends a real email), `/test-active`
  - [x] readable error messages
- [x] Branded password-reset email (`src/emails/`), with a link built from `site.frontendUrl`. It never throws, so it can't leak which emails exist.
- [x] `src/app.ts` / `src/server.ts` split
- [x] **Test harness** (hand-written; `inject_api_tests` needs Blueprint Pro): vitest + supertest, separate `classcourse_db_test`, local SMTP server, live R2 tests. `npm test`: 27 passing.
- [x] `npm run create-admin -- <email> <password>` script

### Admin
- [x] Admin-only login guard (reject non-ADMIN), sidebar layout (`(panel)/layout.tsx`)
- [x] **Login page redesign**:
  - [x] brand panel with "3D" card stack; header band plus overlapping card on phones
  - [x] show/hide password (`aria-pressed`, label switches), Caps Lock warning, `autocomplete` hints, 16 px inputs
  - [x] friendly errors (401/429/offline), pressable button, dark mode, reduced motion
  - [x] verified with device emulation at 320/390/820/1440 px (light and dark): no overflow; a real sign-in reaches the dashboard
- [x] Dev admin account seeded from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (`backend/.env`)
- [x] Fixed: the global CSS forced `font-family: Arial`, overriding Geist across the admin
- [x] **Dashboard shell: shadcn `sidebar-07`**, redesigned in the login page's style:
  - [x] navy sidebar, amber active marker, "CC" brand header
  - [x] collapses to an icon rail on desktop; slide-out sheet on phones (closes after navigating)
  - [x] header breadcrumb from `nav.ts`
  - [x] user menu with System/Light/Dark theme and a real logout (revokes the refresh token)
- [x] shadcn initialised (Radix, Nova), `next-themes`, brand tokens for light and dark, Sonner toasts. Fixed the circular `--font-sans` token that shadcn generated.
- [x] **Dashboard:**
  - [x] welcome banner with the 3D card stack
  - [x] stats: students, subjects, chapters, revenue
  - [x] **launch checklist** driven by real settings (storage, private bucket, email, Razorpay, legal pages)
- [x] **Settings → General:** Site / Contact / Social cards, each saving and resetting independently, with source badges
- [x] **Settings → Storage:** rebuilt with shadcn, plus the **Private bucket** field and a warning while it's empty
- [x] **Settings → Email (SMTP):** Gmail/Outlook/Zoho presets, SSL switch that adjusts the port, masked password, test email (defaults to your address), reset to .env
- [x] Verified with device emulation at 390 and 1440 px, light and dark: no overflow, no console errors; phone sheet and collapsed rail work. Functional tests through the UI: General save and reset; Email bad host refused, nothing saved; Storage test passes on real R2.
- [x] **Settings → Storage (Cloudflare R2)** form:
  - [x] endpoint, bucket, access key ID, secret (masked), public base URL, signed-URL TTL
  - [x] **Test connection** button, Reset to .env, active-source indicator
  - [x] Help text about bucket CORS
- [ ] Settings → Quiz & Coins (moved to Phase 3 admin, alongside the quiz screens)

### Frontend
- [x] **Design system** (`frontend/src/app/globals.css`):
  - [x] brand tokens shared with the admin (light/dark via next-themes)
  - [x] **3D utilities** `card-3d`, `lift`, `press-3d` (kept as tokens while "3D" is pending)
  - [x] `.rich` content styles; reduced-motion respected
- [x] **Fonts:** Geist (Latin) + **Noto Sans Bengali** (Assamese ৰ ৱ; `:lang(as)` uses it first) + Bricolage Grotesque headings
- [x] shadcn (Radix/Nova) in the frontend too
- [x] **Cache Components** on: cached server reads in `src/lib/server-api.ts` (`'use cache'` + `cacheLife` + `cacheTag`: settings, pages, catalog), with safe fallbacks when the API is down
- [x] **Header:** logo, Home/Classes, theme toggle, account (Sign in / Join free, or coin chip + avatar menu with Sign out); mobile sheet menu. Login state is shared across components and tabs.
- [x] **Footer** (server, cached): about blurb (English + Assamese), published pages only, contact email, social icons (inline SVG; Lucide 1.x has no brand icons)
- [x] **Auth pages:**
  - [x] `/login` (with `?next=`, open-redirect safe)
  - [x] `/register` (8-character rule, Terms/Privacy links when published, under-18 note)
  - [x] **`/forgot-password` + `/reset-password`**: the backend already emailed links to `/reset-password?token=`, but that page didn't exist
- [x] **Home:** hero, medium picker (cached catalog), "How it works" using live quiz/coin settings
- [x] Verified:
  - [x] home has no overflow on phone or desktop, light or dark; Assamese renders in Noto Sans Bengali
  - [x] register through the form shows the coin chip and avatar; sign out works; duplicate email gets a friendly message
  - [x] forgot → reset (token from the DB, as from the email) → mismatched passwords caught → link can't be reused → sign in with the new password returns to `?next`
  - [x] open-redirect blocked; temporary student deleted

## Phase 1 — Catalog (Medium → Class → Subject → Part → Chapter)
### Backend
- [x] Prisma models `Medium`, `ClassLevel`, `Subject`, `SubjectPart`, `Chapter`, plus migration `catalog`
- [x] `User.mediumId?` and `User.classLevel?` preferences. `PATCH /api/users/me/preferences`, and they are returned by `/api/auth/me`.
- [x] Idempotent, non-destructive seed (`npm run seed`):
  - [x] 12 classes
  - [x] English Medium: 68 subjects, 33 parts, 920 chapters (exactly Appendix A)
  - [x] Assamese Medium: 112 subjects with Assamese names, no chapters (counts pending)
- [x] Public routes `/api/catalog/...`:
  - [x] mediums
  - [x] classes that have subjects in a medium
  - [x] class → subjects with chapters grouped by part (dropdown data)
  - [x] subject
  - [x] chapter, with `prev`/`next` across parts, skipping unpublished chapters, plus `position`
- [x] Admin routes under `/api/admin`:
  - [x] mediums: CRUD and reorder
  - [x] classes: show/hide
  - [x] subjects: CRUD, reorder, full tree view
  - [x] parts: CRUD and reorder. Deleting a part keeps its chapters.
  - [x] chapters: CRUD, bulk "add N placeholders", reorder within a group, move between parts
  - [x] destructive deletes answer 409 (subject needs `?force=true`; a medium can't be force-deleted)
- [x] Security fix: `GET /api/users` (every user's email) is now ADMIN-only. Before, any logged-in user could call it.
- [x] Tests: 25 new (52 total). They cover the seed counts, idempotency, the public API, prev/next edge cases, admin CRUD/reorder/guards, and preferences.
- Note: `inject_crud_controller` was dry-run and rejected. It used per-route `try/catch` + 500s, leaked `error.message`, and had cascading deletes.

### Admin
- [x] **Mediums** (`/catalog/mediums`): create any medium (native name, slug filled automatically from the name), edit, show/hide, ↑/↓ reorder, delete (blocked while the medium has subjects, with an explanation)
- [x] **Classes** (`/catalog/classes`): show/hide Class 1–12 site-wide, with subject counts
- [x] **Subjects & chapters** (`/catalog/subjects`): medium tabs + class chips with counts (selection kept in the URL); add/rename subjects; reorder; show/hide; delete that warns how many chapters go with it
- [x] **Subject editor** (`/catalog/subjects/[id]`):
  - [x] chapters grouped as on the student site; placeholder names flagged
  - [x] edit title (Assamese OK), number, web address, part
  - [x] publish switch plus publish/unpublish all
  - [x] ↑/↓ reorder within a group
  - [x] bulk add N placeholders to any part
  - [x] parts: add, rename, reorder, delete (chapters kept)
  - [x] deleting a chapter with content shows the server's warning, then force-deletes
- [x] `useConfirm()` dialog replaces every `window.confirm`, including the settings pages
- [x] Verified end-to-end through the UI with temporary data, then cleaned up: medium create/delete; subject → 3 chapters + part + 2 chapters → Assamese rename → move → unpublish (the API confirms the reading order) → force delete. No phone overflow, no console errors.

### Frontend
- [ ] `/` with medium picker and class grid
- [ ] `/[medium]` class grid
- [ ] `/[medium]/class-[n]` subject cards with an **accordion dropdown of chapters**, grouped by part
- [ ] `/[medium]/class-[n]/[subject]` subject page
- [ ] Chapter page shell with **Previous / Next Chapter buttons** (disabled on the first and last chapter)

## Phase 2 — Chapter content
### Backend
- [x] `Question` model (QA/MCQ, TEXTBOOK/EXTRA, optional explanation, difficulty pending, published flag) and `Video` model. Migration `chapter_content`.
- [x] All rich text is sanitised on save (`src/utils/sanitizeHtml.ts`). No scripts, event handlers, styles, SVG or iframes; images must be absolute http(s); links get `rel=noopener`.
- [x] Content rules in `question.service.ts`, shared by the form and the importer: QA needs an answer; MCQ needs 2–6 distinct options and a correct index.
- [x] Admin routes:
  - [x] `GET /chapters/:id/content` (editor view)
  - [x] question CRUD and reorder per section (source + kind); changing kind or section is handled cleanly
  - [x] chapter `aboutHtml` through `PATCH /chapters/:id`
  - [x] deleting a chapter with content needs `?force=true`
- [x] **Bulk import** `POST /chapters/:id/questions/import`:
  - [x] CSV (Excel/Sheets export, with BOM, Assamese text, multi-line cells) or JSON
  - [x] dry-run preview by default, with every bad row reported by spreadsheet row number
  - [x] commit is all-or-nothing, in `append` or `replace` mode; max 500 rows; JSON body limit raised to 3 MB
- [x] Videos: CRUD and reorder. Accepts any YouTube URL form (watch, youtu.be, shorts, embed, live) or a bare ID.
- [x] Image upload `POST /uploads/images`: presigned PUT to the public bucket that **signs the exact type and size** (png/jpg/webp/gif, ≤5 MB; SVG refused). It returns the public URL. Verified live on R2.
- [x] Public chapter payload now includes `content.{textbook,extra}.{qa,mcq}` and `videos`. **MCQ answers are not included**; `POST /api/catalog/questions/:id/check` reveals one answer and its explanation.
- [x] Tests: 28 new (80 total), including XSS cases and a live R2 upload.

### Admin
- [x] **Chapter content editor** at `/catalog/subjects/[id]/chapters/[chapterId]`:
  - [x] tabs About / Q&A / MCQs / Videos / Import, with counts; the tab is kept in the URL
  - [x] Previous/Next chapter in reading order
  - [x] tapping a chapter row in the subject editor opens it ("Edit details" moved to the menu)
- [x] **Rich text editor** (Tiptap v3, `components/admin/editor/rich-text-editor.tsx`):
  - [x] bold/italic/underline, sub/superscript, headings, lists, quote, link, undo/redo
  - [x] image upload to R2
  - [x] it only offers what the backend sanitiser keeps
- [x] **About** tab with unsaved-changes state
- [x] **Q&A and MCQs:** one card per section (Textbook/Extra), reorder, publish switch, delete
  - [x] the question dialog has rich question/answer/explanation, 2–6 MCQ options with a correct-answer picker, difficulty, a section/type switch, and checks before saving
  - [x] the MCQ tab shows **"Quiz ready" once there are ≥10 published MCQs**
- [x] **Videos:** paste any YouTube link; thumbnails, rename, reorder, remove
- [x] **Import:** CSV/JSON templates (Excel-friendly UTF-8 BOM), column guide, file upload or paste, `.xlsx` rejected with "save as CSV UTF-8" advice
  - [x] the dry-run preview table shows errors per spreadsheet row, and Import is disabled until all rows are valid
  - [x] append or replace (replace asks to confirm)
- [x] Verified end-to-end with a temporary subject, then cleaned up:
  - [x] About HTML (bold + subscript) stored
  - [x] Assamese Q&A added
  - [x] MCQ refused without a correct option, then saved
  - [x] import blocked on a bad row, then imported 3
  - [x] YouTube ID parsed; Next chapter works; phone has no overflow
- [ ] **Browser image upload needs an R2 bucket CORS rule.** It was blocked in the test (handled with a clear message). Settings → Storage now shows the exact policy for this origin with a Copy button. Apply it to both buckets in the Cloudflare dashboard. Phase 4 note PDF uploads need the same rule.

### Frontend
- [ ] Chapter page sections: About the lesson/author, Textbook Q&A, Extra Q&A, Extra MCQs (tap to reveal via `POST /api/catalog/questions/:id/check`), Videos (lazy YouTube embed)
- [ ] Render stored HTML as-is. The backend already sanitised it, so don't double-escape. Style `sub`/`sup`/tables for math.
- [ ] ISR plus `generateMetadata` for the content pages, a sitemap and robots.txt
- [ ] Check that Assamese script renders correctly on Android Chrome and iOS Safari

## Phase 3 — Quiz & coins
### Backend
- [x] `QuizAttempt` and `CoinTransaction` (append-only ledger; `(reason, refId)` is unique) models, plus `User.coins` as a cached balance. Migration `quiz_and_coins`.
- [x] Quiz engine (`src/services/quiz.service.ts`), `/api/quiz`:
  - [x] start: 10 random published MCQs, settings snapshot, and today's unfinished attempt resumes
  - [x] `next` reveals a question and starts its clock; it is idempotent
  - [x] `answer`: server deadline plus 1.5 s grace; the correct answer is revealed only after answering
  - [x] `pause`: forfeits a question that is on screen
  - [x] resume through `next`
  - [x] expiry at IST midnight
  - [x] daily limit counts quizzes started that day
  - [x] guarded updates, so a double-submit counts once
  - [x] a question deleted mid-quiz counts in the student's favour
- [x] Coins: `applyCoinChange()` in `coin.service.ts` is the only writer. It runs inside a transaction and can't overdraw.
  - [x] a pass pays `coins.perPass`, following the new `coins.awardRule` setting (default `firstPassPerChapter`, to stop farming)
- [x] Per-user rate limiter on `/api/quiz` (90/min). Hand-written: `inject_rate_limiter` and `inject_transaction` need Blueprint Pro.
- [x] Student routes:
  - [x] `GET /api/quiz` (rules and today's usage)
  - [x] `/api/quiz/today` (paused quizzes)
  - [x] `/api/quiz/history`
  - [x] `GET /api/users/me/coins`
  - [x] `coins` in `/api/auth/me`
- [x] Admin routes:
  - [x] `GET /api/admin/users` (search, role filter, paging)
  - [x] `/users/:id` (ledger and attempts)
  - [x] `PATCH` role/name: not your own role, never the last admin; signs the user out
  - [x] `POST /users/:id/coins` (reason required)
- [x] Tests: 30 new (110 total). They cover timing, forfeit on pause, expiry, the daily limit, concurrency, the coin rules, the ledger and the admin guards.

### Admin
- [x] **Settings → Quiz & coins** (`/settings/quiz`):
  - [x] quiz rules (questions, seconds, pass mark, daily limit), with the pass mark checked against the question count and a "Students will see…" preview
  - [x] coin rules: per pass, coin value entered in ₹ (stored in paise), max discount, award rule with explained options
  - [x] a worked price example using the same maths as the backend (`quoteDiscount` in `src/lib/people.ts` mirrors `order.service.quotePrice`)
  - [x] reset to defaults
- [x] **Users** (`/users`): search as you type, All/Students/Admins tabs, pagination (all kept in the URL); table on desktop, cards on phones
- [x] **User profile** (`/users/[id]`):
  - [x] coins and quizzes-passed stats
  - [x] **adjust coins** (add/remove, reason required, new-balance preview, overdraw blocked)
  - [x] rename
  - [x] **role change** with confirm dialogs. You can't change your own role; the backend also protects the last admin and signs the user out.
  - [x] coin history with readable reasons and balance after; recent quizzes with status, score and coins
- [x] Verified end-to-end with 2 temporary students (deleted afterwards):
  - [x] quiz settings validation, save and reset
  - [x] the coin example matches the backend (245 coins → ₹24.50)
  - [x] search and filter
  - [x] +50 coins logged; overdraw blocked
  - [x] promote and demote; own role locked
  - [x] no phone overflow, no console errors
- [x] **Quiz reports** (added after Phase 5 at the client's request: "can admin check submitted quizzes?"):
  - [x] backend: `quizReport.service.ts` + `GET /api/admin/quiz/attempts`, `/attempts/:id`, `/stats`; indexes on `QuizAttempt(dayKey)` and `(chapterId, status)`; stale attempts expired before reporting; 9 tests in `tests/quizReport.test.ts`
  - [x] **Quizzes → Attempts** (`/quizzes/attempts`): date range, medium/class/subject filters, status tabs, student search, totals (attempts, pass rate, average score, unfinished/expired), pagination; all kept in the URL
  - [x] **Attempt detail** (`/quizzes/attempts/[id]`): every question in the order the student saw it, their choice vs the correct option, outcome (correct/wrong/skipped/timed out/not reached/removed), explanation, link to edit the chapter's MCQs
  - [x] **Quizzes → Chapter stats** (`/quizzes/stats`): attempts, pass rate and average score per chapter; opening a chapter lists its MCQs hardest first with the most-picked wrong option, timeouts, and a "Check the answer key" flag (accuracy < 40% over ≥ 5 answers)
  - [x] the user profile's recent quizzes link to the detail page; "see all" opens Attempts filtered to that student
  - [x] verified end-to-end with 3 temporary students and 10 temporary MCQs (deleted afterwards): totals, status tabs, detail marks, 404 state, stats, profile links, no phone overflow

### Frontend
- [ ] Quiz guidelines screen (PDF §5.1 text)
- [ ] Timed question UI. Flow: `POST /api/quiz/start` → guidelines → `POST …/next` → show the question with a countdown from `remainingMs` → `POST …/answer` (send `optionIndex: null` when time runs out) → show the correct answer → "Next".
  - [ ] Call `…/pause` on `visibilitychange`/`pagehide` (use `fetch` with `keepalive`).
  - [ ] Tell students that leaving mid-question forfeits that question.
- [ ] Result screen: score, pass/fail, coins earned (0 on a repeat pass under the default rule; explain why)
- [ ] `/profile`: coin balance and history, today's paused quizzes (resume), purchased notes

## Phase 4 — Premium notes & Razorpay
### Backend
- [x] `razorpay` settings group:
  - [x] key ID, key secret and webhook secret, encrypted and masked
  - [x] `RAZORPAY_*` env fallback
  - [x] admin `GET/PUT/DELETE /settings/razorpay` + `/test`. PUT checks the keys with Razorpay first. The response shows test/live mode and the webhook URL.
- [x] `Note`, `Order` and `NoteAccess` models, plus the coin reason `NOTE_DISCOUNT_REFUND`. Migration `notes_and_payments`.
- [x] Razorpay REST client `razorpay.service.ts` (fetch, no SDK, so tests point it at a fake server). Signature checks use timing-safe compare.
- [x] Notes are attached to a chapter OR a whole subject. Paid notes cost at least ₹1. A note can't be published without a PDF, and uploads refuse to run until a **private bucket** is set.
- [x] Two-step PDF upload:
  - [x] presigned PUT to the **private** bucket (`notes/<id>/<uuid>.pdf`, exact type and size signed, ≤50 MB)
  - [x] `POST /admin/notes/:id/file` HEAD-checks the object before attaching it
- [x] Orders (`order.service.ts`):
  - [x] price quote with the coin discount (capped by `maxDiscountPercent`; never less than ₹1 to pay; 100% coverage skips Razorpay)
  - [x] coins are **held** at order time and refunded when the order is replaced, abandoned for 30 minutes, or Razorpay fails
- [x] Confirmation:
  - [x] `POST /api/payments/verify`: checkout signature, then the payment is fetched from Razorpay and must be `captured` with the exact amount. `authorized` returns PENDING.
  - [x] **webhook** `/api/payments/webhook/razorpay`: raw-body HMAC; handles `payment.captured` / `order.paid` / `payment.failed`
  - [x] grants are idempotent: verify + webhook in any order never double-grant. A payment after cancellation still grants. A duplicate purchase is flagged for a refund.
  - [x] admin `reconcile` asks Razorpay directly (for a missed webhook or a closed tab)
- [x] Downloads: `GET /api/notes/:id/download` (login; free notes, or `NoteAccess` for paid ones). It returns a presigned private URL with a proper filename and the TTL from settings.
- [x] Store:
  - [x] `GET /api/notes` (filter by medium/class/subject/chapter, with `owned` when logged in)
  - [x] `/api/notes/:id/quote`
  - [x] the chapter payload includes `notes`
  - [x] `/api/users/me/notes`, `/api/users/me/orders`
- [x] Admin:
  - [x] notes CRUD (a note that was ever ordered can't be deleted)
  - [x] manual grant
  - [x] orders list with revenue totals, order detail, reconcile
- [x] Purchase receipt email (`src/emails/purchaseReceipt.ts`). It never throws.
- [x] Per-user payment rate limiter. `validateBody` now accepts refined schemas.
- [x] Tests: 29 new (139 total). They use a local **fake Razorpay** HTTP server (forged signatures, replayed payments, wrong amounts, authorized→webhook, failures, abandoned orders, Razorpay outage, 100% coins, reconcile) plus a **live R2** PDF upload/download.
- Note: `inject_payment_webhook` needs Blueprint Pro, so the webhook is hand-written.

### Admin
- [x] **Settings → Payments** (`/settings/payments`):
  - [x] key ID with a TEST/LIVE badge, masked key and webhook secrets, Test keys, Save (checked by Razorpay first)
  - [x] a confirmation before switching to live keys
  - [x] webhook URL with Copy, the events to tick, and a warning that local addresses can't be reached by Razorpay
- [x] **Premium notes** (`/notes`):
  - [x] create/edit with a cascading **Medium → Class → Subject → (whole subject | chapter)** picker; price in ₹ or Free
  - [x] **PDF upload with a progress bar** (XHR presigned PUT to the private bucket, then `/file` confirms)
  - [x] publish switch (refused without a PDF)
  - [x] give a note to a student; delete (blocked once students have it, with an explanation)
  - [x] **works without a private bucket:** a banner, and the upload dialog explains what's missing
- [x] **Orders** (`/orders`):
  - [x] revenue and paid-count summary; All/Paid/Awaiting/Cancelled tabs; pagination
  - [x] detail side panel: price → coin discount → paid; Razorpay IDs with copy; "confirmed by"; **needs-attention** problems
  - [x] **Check with Razorpay** (reconcile)
- [x] Fixed: the `(panel)` layout nested a second `<main>` inside shadcn's `SidebarInset` (which is already `<main>`), so there were two main landmarks
- [x] Verified end-to-end with a temporary fixture (deleted afterwards):
  - [x] fake Razorpay keys rejected by the real API, nothing saved
  - [x] note created through the picker; publish without a PDF refused; missing private bucket explained
  - [x] switched to Free; given to a student
  - [x] orders list, revenue and filter; detail panel; reconcile message without keys
  - [x] no phone overflow, no console errors
- [ ] **Blocked until you set it up:** a real PDF upload (needs the private bucket + CORS) and a real test purchase (needs `rzp_test_` keys + webhook on a public URL)

### Frontend
- [ ] `/notes` store, notes section on the chapter page
- [ ] Razorpay Checkout with a "use coins" toggle.
  - [ ] Show `/api/notes/:id/quote`.
  - [ ] `POST /api/payments/orders` → open Checkout with `checkout.*` → handler → `POST /api/payments/verify`.
  - [ ] If PENDING, poll `GET /api/payments/orders/:id`.
  - [ ] Never unlock in the browser itself.
- [ ] "My notes" downloads
- [ ] Test the full flow in Razorpay test mode: success, failure, closed tab (webhook-only)

## Phase 5 — Static & legal pages
### Backend
- [x] `Page` and `FaqItem` models, migration `pages_and_faq`. These replaced the planned settings group: legal pages need a per-page draft/publish state and a "last updated" date.
- [x] Known pages: `about`, `contact`, `privacy`, `terms`, `refund-policy`.
- [x] **Draft text written for all 5 pages + 10 FAQs** (`prisma/seed-data/pages.ts`), based on how the site really works: coins have no cash value, orders auto-cancel after 30 minutes, the quiz pause rule, Razorpay, under-18 consent. They are seeded **unpublished** into the dev DB, waiting for the owner's approval.
- [x] **Live tokens** such as `{{quiz.secondsPerQuestion}}` and `{{contact.email}}` are filled from current settings when a page is served, so the FAQ/Terms never go stale. Values are HTML-escaped; unknown tokens stay visible.
- [x] Public routes:
  - [x] `GET /api/content/pages` (published, in footer order, with `updatedAt`)
  - [x] `/api/content/pages/:slug`
  - [x] `/api/content/faq`
- [x] Admin routes:
  - [x] `GET/PUT /api/admin/pages/:slug`: sanitised; can't publish an empty page; the admin view returns raw text plus a rendered preview and the token list
  - [x] FAQ CRUD and reorder
- [x] Tests: 13 new (152 total).

### Admin
- [x] **Site pages** (`/pages`): the 5 pages with Draft/Published, Legal tags and last-updated date; an approval banner while any are drafts
- [x] **Page editor** (`/pages/[slug]`):
  - [x] title and rich text with an **"Insert value" token menu** (shows current values)
  - [x] **Edit / Preview** tabs; the preview renders tokens with the backend's rules, including unsaved changes
  - [x] **unknown-token warning**
  - [x] publish switch with confirmation (legal pages remind about owner/lawyer review)
  - [x] warns before leaving with unsaved changes
- [x] **FAQ** (`/faq`):
  - [x] add/edit (plain question with token chips, rich answer with the token menu); ↑/↓ reorder; publish switch; Publish all (confirmed); delete
  - [x] questions and answers shown with live values filled in
- [x] Fixed: after choosing from "Insert value" or applying a link, focus jumped to the menu button, so further typing was lost. Focus now returns to the editor.
- [x] Verified end-to-end with an exact backup and restore, so the drafts are untouched:
  - [x] the Tiptap edit round-trip keeps `href="mailto:{{contact.email}}"`
  - [x] insert value, typo warning and preview
  - [x] publish → public API 200 → unpublish → 404
  - [x] FAQ add with token, reorder, publish-all confirmation
  - [x] no phone overflow, no errors
- [ ] **Owner action:** read and approve each draft, then publish here (task #29)

### Frontend
- [x] Draft content: mission/vision, contact, FAQ, Privacy, Terms and Refund are all written (backend seed). **Send them to the client for approval.**
- [ ] Render `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/refund-policy` from `/api/content/*`, showing "Last updated" on legal pages. Put the footer links in `GET /api/content/pages` order.
- [ ] Contact page: email only (no phone, WhatsApp or address)

## Phase 6 — Polish & launch
### Backend
- [x] **Fixed:** `CORS_ORIGIN` comma lists were passed to `cors` as one literal string, so both sites would have been blocked. It is now parsed into an exact allow-list and validated.
- [x] **Fixed:** added `TRUST_PROXY`. Without it, behind nginx every student would have shared one login rate-limit bucket, and the admin's webhook URL would have shown `http://`.
- [x] Production env guard: with `NODE_ENV=production` the API refuses to start on `CORS_ORIGIN=*`, a JWT secret under 32 characters, a localhost `FRONTEND_URL`, or an overridden Razorpay API base.
- [x] `/health/ready` (database check) and a Docker healthcheck. Graceful SIGTERM shutdown (in-flight requests finish, 15 s grace) was verified in Docker: exit 0.
- [x] Background cleanup (every 5 minutes) releases coins held by abandoned orders, even if the student never comes back.
- [x] Docker hardening:
  - [x] `mem_limit` and a V8 heap cap on every service (deploy-preflight: 10 passed, 0 warnings)
  - [x] Postgres and the API bound to **127.0.0.1** (Postgres was published on all interfaces before)
  - [x] Postgres credentials read from the root `.env` (they were hard-coded `postgres`)
  - [x] the API runs as the non-root `node` user; log rotation; `tests` excluded from the image
- [x] Full stack verified in Docker: build → migrate (9 migrations) → healthy → real data served (about 57 MB RAM of 512 MB).
- [x] `DEPLOY.md` runbook: env tables, first deploy, seed and create-admin through `docker compose run`, reverse proxy, admin service setup, backups, post-deploy checks.
- [x] Tests: 6 new (158 total).
- [ ] **Deploy** once a VPS and domain exist: follow `DEPLOY.md`, run the preflight with `--host`, then enter the production R2/SMTP/Razorpay details in admin.

### Admin
- [x] **All admin phases (0–5) built**: dashboard, settings (general, quiz & coins, storage, email, payments), catalog, chapter content, users & coins, notes, orders, pages & FAQ
- [ ] Deploy admin (and add its production domain to the backend `CORS_ORIGIN` and the R2 CORS policy), final QA

### Frontend
- [ ] Final 3D design pass once the client clarifies what "3D" means. Respect `prefers-reduced-motion`.
- [ ] Mobile QA at 360 px, plus an accessibility pass (contrast, tap targets, keyboard)
- [ ] Performance: image optimisation, font subsetting, Lighthouse ≥ 90 on mobile
- [ ] Deploy frontend, set up domain and SSL
- [ ] Create the business email and replace the Gmail in the `contact` setting

## Admin UX pass (1 Oct 2026, before frontend Phase 1)
- [x] **Automatic links:** the "Web address" (slug) inputs are removed from the Medium, Subject and Chapter dialogs and replaced by a link preview plus a tucked-away "Change link"
  - [x] backend: Assamese-only names get `medium-N` / `subject-N`; link clashes get a suffix; duplicate names give a plain 409; the automatic `chapter-N` follows the chapter number; error text no longer says "slug" or "?force=true"
  - [x] tests added in `tests/catalog.test.ts` (167 green)
- [x] Raw paths in lists replaced by "View on site ↗" (`NEXT_PUBLIC_SITE_URL`)
- [x] **One standard page width** for all 19 admin pages (full width, 1600 px cap). Checked at 390, 768, 1440 and 1920 px, light and dark: no horizontal scroll
- [x] Settings wording: ".env" → "server values"
- [x] The chapter "Quiz ready" banner reads the live `questionsPerQuiz` setting (it was hard-coded to 10)
- [x] Verified with puppeteer using temporary mediums, a subject and chapters (deleted afterwards)

## Quiz builder (1 Oct 2026, admin refinement)
- [x] **Option 2 "Use in quiz"** flag per MCQ:
  - "In quiz / Practice only" pill on each MCQ row, bulk "Use all / Set all to practice" per section
  - switch in the question dialog
  - import column `quiz` (yes/no)
- [x] **Automatic chapter quiz** can be switched off site-wide (Settings → Quiz & coins) or per chapter. The chapter MCQs tab has a quiz panel showing readiness and custom quizzes, plus "New quiz from this chapter"
- [x] **Custom quizzes** (Content → Quizzes → Quiz builder):
  - any chapters of one medium + class (chapter, chapters, subject, several subjects)
  - **Random** (textbook/extra, difficulty filters, optional easy/medium/hard mix, quiz-marked only) or **Hand-pick** (search, tick, reorder)
  - own question count, seconds, pass mark, coins, attempts per student
  - shuffle questions/options, show answers after each / at end / never
  - publish + open/close dates (India time)
  - live pool counter, readiness check in plain English (publishing blocked until ready), sample preview, duplicate, delete (attempts keep the title)
- [x] **Student API** (for the frontend phase): `GET /api/catalog/quizzes` (and `/api/quiz/available` with attempts used), `POST /api/quiz/start {quizId}`
- [x] Reports:
  - attempts show the quiz title and filter by quiz
  - attempt detail for multi-chapter quizzes
  - Stats has a "Custom quizzes" table and a practice-only badge
  - user profile handles quiz attempts
- [x] Tests: `tests/quizBuilder.test.ts` (10). Backend 177 green
- [x] Admin: tsc, lint and build pass. Puppeteer e2e with temporary MCQs, quizzes and students (deleted afterwards), on phone and desktop, light and dark
  - fixed during e2e: rapid ticks lost hand-picks (stale state); a stray "leave page?" prompt after creating a quiz
- [x] **Simplified the builder:**
  - 4 short steps (name, chapters, questions, publish); everything else is under "More options", closed by default with a one-line summary
  - defaults show as "Default: 10 seconds · Change"
  - plain wording
  - the chosen chapters collapse to a summary with "Change chapters"
  - clearer intro on the list ("every chapter already has its own quiz")
  - e2e re-run green

## Flexible classes (1 Oct 2026, admin refinement)
- [x] **Schema:** `ClassLevel` now has `name`, `nativeName`, unique `slug`, `order` and timestamps instead of a fixed `number`, and `User.classLevelId` replaces `classLevel Int`
  - migration `flexible_classes` backfills "Class N" / `class-N` / order N and students' saved class, so existing links are unchanged
- [x] **Admin API:** `GET/POST /classes`, `PATCH/DELETE /classes/:id`, `PUT /classes/reorder`
  - duplicate names are refused in plain words
  - links are automatic (`medium-N`-style fallback for Assamese-only names)
  - delete is blocked while subjects or quizzes use the class
- [x] **Everything refers to classes by id or slug:** subjects (`classId`), quiz builder, reports and filters (`classId`), notes (`classSlug`), public catalog (`/classes/:classSlug`, numbers still accepted) and quiz availability
- [x] **Admin UI:**
  - Catalog → Classes: add/edit dialog with Assamese name and link preview, reorder, hide, delete with explanation, per-medium subject counts
  - subject class tabs, quiz builder, report filters and the notes picker list the managed classes
  - no 1–12 lists remain
- [x] Tests: new class CRUD test (add LKG, Class 13, Assamese-only, rename, reorder, URLs, delete rules). Backend 178 green
- [x] Admin tsc, lint and build pass. Browser tests (add/rename/reorder/hide/delete class, subject in a new class, quiz builder) pass, phone and desktop

## Waiting on client
| # | Item | Who |
|---|---|---|
| 1 | Mission and vision text for About Us | Client (developer may draft) |
| 2 | Business email for the website | Developer |
| 3 | Address: show it or not | Client |
| 4 | Privacy Policy and Terms of Service | Developer drafts, client reviews |
| 5 | Chapter names and content (PDF files) | Client |
| 6 | Explanations for answers: yes or no | Client |
| 7 | Difficulty levels: yes or no (textbook vs extra advanced?) | Client |
| 8 | Confirm the daily limit of 10 quizzes | Client |
| 9 | Coin values (coins per pass, coin → ₹ discount, max discount) | Client (developer may suggest) |
| 10 | Which notes are free and which are premium; note prices | Client |
| 11 | FAQ content | Developer drafts, client approves |
| 12 | What "3D" design means (full 3D style vs 3D accents) | Client |
| 13 | Logo, colour scheme, fonts, images | Client / agreed with developer |
| 14 | Razorpay account (in the client's name, KYC) and fee acknowledgement | Client and developer |
| 15 | **New:** Confirm that the PDF subject list is for **English Medium** | Client |
| 16 | **New:** Assamese Medium chapter counts and names for every subject | Client |
| 17 | **New:** Other mediums wanted at launch (Hindi, Bengali, …) | Client |
| 18 | **New:** Class 1: in scope? The PDF says Class 2–12, the screenshot shows Class 1 | Client |
| 19 | **New:** Class 11 English: does the 14 include the 6 Writing Skills chapters? | Client |
| 20 | **New:** Check the Assamese subject name spellings (read from a low-resolution screenshot) | Client |
| 21 | **New:** Cloudflare R2 account and bucket (in the client's name?), access keys, custom domain for public images | Client and developer |
| 22 | **Decided:** create a separate **private** R2 bucket for premium notes and set it as "Private bucket" in storage settings. The backend supports this. | Developer |
| 23 | **New:** SMTP credentials for the business email (host, port, user, app password) | Client and developer |
| 24 | **New:** Razorpay test and live keys, and the webhook secret | Client |
| 25 | **New:** Coins for re-passing the same chapter? Default: first pass per chapter only (setting `coins.awardRule`: `firstPassPerChapter` / `firstPassPerChapterPerDay` / `everyPass`) | Client |
| 26 | **New:** Confirm with the client: pausing while a question is on screen forfeits that question (it prevents pause-and-search). Leaving between questions costs nothing. | Client |
| 27 | **New:** Free notes need login to download. Confirm with the client. | Client |
| 28 | **New:** Razorpay dashboard: add the webhook (URL shown in Admin → Settings → Payments; events `payment.captured`, `payment.failed`, `order.paid`) and keep **auto-capture ON** | Developer |
| 29 | **New:** Owner to read and approve the draft About, Contact, FAQ, Privacy, Terms and Refund texts (Admin → Pages → publish). Ideally a lawyer reviews the legal pages. | Client |
| 30 | **New:** Students are minors. The drafts ask for parent/guardian consent. Confirm whether India's DPDP Act needs verifiable parental consent at sign-up (for example a checkbox or a parent email) before launch. | Client (legal) |
| 31 | **New:** VPS and domain(s) for the API, site and admin, plus SSH access for the deploy preflight | Client and developer |
| 32 | **New:** Add the CORS policy (Settings → Storage → "Uploads from this panel need a CORS rule", Copy) to the public and private R2 buckets, and later add the production admin domain | Developer |
| 33 | **New:** Confirm with the owner that custom quizzes are wanted, and whether some MCQs should be practice-only. The FAQ and guideline drafts quote the 10 / 10 s / 7 defaults, and a custom quiz can use different rules (the guidelines screen should show each quiz's own rules) | Client |
