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
- [x] `/` with medium picker and class grid (FD-2)
- [x] `/[medium]` class grid (FD-2)
- [x] `/[medium]/[class]` subject cards with an **accordion dropdown of chapters**, grouped by part (FD-2)
- [x] `/[medium]/[class]/[subject]` subject page (FD-2)
- [x] Chapter page shell with **Previous / Next Chapter buttons** (disabled on the first and last chapter) (FD-2)

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
- [x] Video `format` (LANDSCAPE 16:9 / SHORT 9:16, migration `video_format`, 28 Oct 2026). A `/shorts/` link sets SHORT automatically; the admin can pick it for other links. A new link without a format re-detects it. The public chapter payload includes `format`. Tests in `content.test.ts`.
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
- [x] Videos: "Long video / Short" shape picker (switches to Short on a Shorts link), shape badge, tall thumbnail for Shorts, edit dialog (title, link, shape), and a watch preview in the real shape
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
- [x] Chapter page sections: About the lesson/author, Textbook Q&A, Extra Q&A, Extra MCQs (tap to reveal via `POST /api/catalog/questions/:id/check`), Videos (lazy YouTube embed; `format: "SHORT"` → 9:16 frame capped in width, `LANDSCAPE` → 16:9) (FD-3)
- [x] Render stored HTML as-is. The backend already sanitised it, so don't double-escape. Style `sub`/`sup`/tables for math. (FD-3)
- [x] ISR plus `generateMetadata` for the content pages, a sitemap and robots.txt (FD-2/FD-3)
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
- [x] Quiz guidelines screen (PDF §5.1 text) (FD-4)
- [x] Timed question UI. Flow: `POST /api/quiz/start` → guidelines → `POST …/next` → show the question with a countdown from `remainingMs` → `POST …/answer` (send `optionIndex: null` when time runs out) → show the correct answer → "Next". (FD-4)
  - [x] Call `…/pause` on `visibilitychange`/`pagehide` (use `fetch` with `keepalive`).
  - [x] Tell students that leaving mid-question forfeits that question.
- [x] Result screen: score, pass/fail, coins earned (0 on a repeat pass under the default rule; explain why) (FD-4)
- [x] `/profile`: coin balance and history, today's paused quizzes (resume) (FD-4); purchased notes (FD-5)

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
- [x] `/notes` store, notes section on the chapter page (FD-5)
- [x] Razorpay Checkout with a "use coins" toggle. (FD-5)
  - [x] Show `/api/notes/:id/quote`.
  - [x] `POST /api/payments/orders` → open Checkout with `checkout.*` → handler → `POST /api/payments/verify`.
  - [x] If PENDING, poll `GET /api/payments/orders/:id`.
  - [x] Never unlock in the browser itself.
- [x] "My notes" downloads (FD-5)
- [ ] Test the full flow in Razorpay test mode: success, failure, closed tab (webhook-only). Blocked on keys, webhook URL and the private bucket (#21, #24, #28)

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
- [x] Render `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/refund-policy` from `/api/content/*`, showing "Last updated" on legal pages. Put the footer links in `GET /api/content/pages` order. (FD-6)
- [x] Contact page: email only (no phone, WhatsApp or address) (FD-6)

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
- [ ] Final 3D design pass once the client clarifies what "3D" means. `prefers-reduced-motion` is respected (FD-6).
- [x] Mobile QA at 360 px, plus an accessibility pass (contrast, tap targets, keyboard) (FD-6)
- [x] Performance: font loading, lazy header, Lighthouse ≥ 90 on mobile (medians 90–92) (FD-6)
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

## Frontend redesign (client mock, 28 Oct 2026)
The client's home-page mock (`docs/design/home-page-mock.html`)
sets the look. The review and every change from the mock are in `plan.md §9b`.
These steps carry out the open **Frontend** items of Phases 1–6 above in that
look. Tick both places as you go. Each step: build, then check at 360/390 and
1440 px (light + dark) with puppeteer, then stop for review.

### FD-0 Prerequisites (backend → admin, by the phase rule) — done 28 Oct 2026
- [x] Moved the mock out of `frontend/public/` (it was served publicly) to `docs/design/home-page-mock.html`
- [x] **News links**:
  - [x] backend: `NewsLink` model (migration `news_links_featured_videos`), admin `GET/POST /api/admin/news`, `PUT /news/reorder`, `PATCH/DELETE /news/:id`; public `GET /api/content/news` (active only, in order); http(s) links only. Tests: `tests/news.test.ts`
  - [x] admin: Content → Pages, FAQ & News → **News links** (add/edit dialog, reorder, show/hide switch, delete); "https://" is added if missing
- [x] **Featured videos**:
  - [x] backend: `Video.featuredAt` (`featured: true/false` on create/PATCH); public `GET /api/catalog/videos/featured` (12 newest, visible chapters only, with chapter link, subject, class and `format`). Tests in `content.test.ts`
  - [x] admin: house button per video ("On home page" badge), optimistic with rollback
- [x] **Search**:
  - [x] backend: public `GET /api/catalog/search?q=` (2–60 chars; mediums, classes per medium, subjects by English/Assamese name, chapters by title; visible only; max 20, broad first; `searchLimiter` 60/min). Tests: `tests/search.test.ts`
- [x] Shared visibility rules `publicSubjectWhere` / `publicChapterWhere` + `catalogHref()` in `catalog.service.ts`
- [x] Verified: backend tsc + 188 tests green; admin tsc + lint clean; live API smoke test (incl. Assamese query); puppeteer at 1440 light and 390 dark (add, hide, reorder, delete news; video on/off home page reflected in the public API; no console errors; test data deleted)

### FD-1 Design system re-skin (no new pages) — done 28 Oct 2026
- [x] Tokens in `globals.css`: the mock's amber/cream palette, warm dark mode (#36: kept by default), surface tokens (`--header-bg`, `--card-surface`, footer colours). Contrast checked: ink on amber 5.7–8.4:1, muted 6.4:1, amber text `#A3570A` 5:1, footer ≥ 8.7:1. The mock's white-on-amber (2:1) is not used for text.
- [x] 3D tokens retuned (`--depth-edge`, `--depth-shadow(-hover)`, `--depth-highlight`, `--press-edge`); `card-3d` / `lift` / `press-3d` keep their names; new `scroll-row` utility
- [x] Type: body 16 px, `.as-text` bumps Assamese to 17 px, one global 3 px focus ring, tap targets ≥ 40 px (header) / 44 px (content)
- [x] Kit (`src/components/kit/`): `LogoMark`, `Coin3D`, `SectionTitle`, `ClassTile` + `BookIcon`, `RowCard`, `NoteCard` (+ `rupees()`), `VideoCard` (thumbnail → youtube-nocookie on tap, 9:16 / 16:9), `NewsCard`, `ScrollRow`. Dev-only preview at **`/kit`** (404 in production)
- [x] Logo: `logo.webp` has an opaque amber box, so the "C" mark is an inline SVG (`LogoMark`); `logo.webp` is the Open Graph image
- [x] Header: amber band; name shown from 360 px (guests) / 400 px (signed in); coin chip = account menu (guests: Sign in, icon-only < 420 px); search sheet (live, English + Assamese); 🌐 medium switcher (cookie `cc_medium`, `src/lib/medium.ts`); menu sheet (only existing pages, dark mode switch, account)
- [x] Footer: dark brown, amber social buttons, every published page, email only
- [x] Existing home hero and auth panel moved off navy/indigo; auth links use the AA amber
- [x] Verified: tsc, lint, `next build` (Cache Components) pass; puppeteer at 360/375/390/414/1440, light + dark: no horizontal overflow, header fits signed in and out, search returns Assamese results, medium cookie set, video tap plays, no console errors
- Note: search results link to catalog pages that FD-2 builds

### FD-2 Home + catalog (Phase 1 frontend) — done 28 Oct 2026
- [x] Home in the mock's order:
  - [x] coin card: live balance (signed in) or "Join free / Sign in" (guest); no made-up numbers
  - [x] quiz card: rules from the `quiz`/`coins` settings, the forfeit + midnight rules worded as enforced, pass-mark ring; signed in: "N more quizzes today" (`/api/quiz/today`). "Pick a chapter" → class grid
  - [x] class grid for the chosen medium (cookie, read inside `<Suspense>`) with medium tabs above it
  - [ ] ~~notes teaser~~ → **moved to FD-5** (the public notes list has no catalog links and `/notes` doesn't exist yet)
  - [x] featured videos row (hidden when empty)
  - [x] news row (hidden when empty)
  - [x] "What is Class Course?" (+ "More about us" once the About page is published)
- [x] `/[medium]` class grid
- [x] `/[medium]/[class]` subjects as a **dropdown of chapters** (native `<details>`, one open at a time), grouped by part, + "Open the subject page"
- [x] `/[medium]/[class]/[subject]` subject page (all chapters by part, SEO)
- [x] Chapter page shell: breadcrumb (phones: "‹ Subject"), number badge, part, "Chapter x of y", About the lesson, **Prev / Next** (disabled at the ends, `rel=prev/next`)
- [x] Empty states in plain words; friendly `not-found.tsx` and `error.tsx` (`retry()`)
- [x] Menu: Quizzes / Videos / Latest news anchors (videos/news only when present)
- [x] Metadata (title, description, canonical) on every catalog page
- [x] Build: `generateStaticParams` lists full paths (`src/lib/catalog-params.ts`): **393 pages prerendered** (mediums, classes, subjects, first chapter of each subject); others stream on first visit, then cached. Params are read inside `<Suspense>` (Cache Components). Unknown links render the not-found page with `noindex` (HTTP 200: streamed)
- [x] Verified: tsc, lint, `next build`, `next start` smoke test; puppeteer 390 + 1440, light + dark, guest + signed in: no overflow, no console errors, medium tabs switch the grid, Previous disabled on chapter 1; test content deleted afterwards
- Follow-up: admin edits reach the site within ~1 minute (`cacheLife("minutes")`). An instant refresh needs a backend → frontend revalidate hook (`revalidateTag("catalog")`); plan it with deploy

### FD-3 Chapter page (Phase 2 frontend) — done 28 Oct 2026
- [x] Sections as cards (each hidden when empty): About the lesson, Textbook Q&A, Extra Q&A, Textbook MCQs, Extra MCQs, Videos; sticky "jump to" chips with counts
- [x] Q&A: numbered question + answer box; difficulty badge only when set (#7)
- [x] MCQ practice: tap an option → `POST /api/catalog/questions/:id/check` → right/wrong colours + icons, the correct answer, the explanation, "Try again". No answer key in the page HTML (checked)
- [x] Videos: thumbnail first, youtube-nocookie on tap; Shorts 9:16 (w-44), long videos 16:9 (full width on phones, 384 px on desktop)
- [x] Rich HTML rendered as stored (`.rich`: sub/sup, tables scroll sideways, lists, images)
- [ ] ~~Notes on the chapter page~~ → FD-5 (with buying). ~~Quiz card~~ → FD-4 (with the quiz screens)
- [x] SEO: metadata + canonical (FD-2), `BreadcrumbList` JSON-LD, `sitemap.xml` (every medium/class/subject/chapter + published pages; 1,126 URLs now), `robots.txt` (account pages + `/kit` disallowed)
- [x] Verified: tsc, lint, build (395 pages); puppeteer 390 + 1440, light + dark: no overflow, no console errors, wrong/right/try-again, jump bar lands below the sticky bars; test content deleted
- [ ] Check Assamese on a real Android phone (Chrome) and iPhone (Safari): needs real devices (renders correctly in desktop Chrome with Noto Sans Bengali)
- [x] Backend follow-up done in FD-4: `checkAnswerLimiter` on `POST /api/catalog/questions/:id/check`

### FD-4 Quiz + profile (Phase 3 frontend) — done 28 Oct 2026
- [x] Backend: `checkAnswerLimiter` (40/min per IP) on `POST /api/catalog/questions/:id/check` (FD-3 follow-up). Backend tsc + 188 tests green (one earlier full run hit a flaky "socket hang up" while the machine was busy; quiz tests alone and two full re-runs were green)
- [x] Chapter page **Quiz** section: each quiz with its own rules (pass ring, questions, seconds, coins); Start / **Resume** (today's unfinished attempt) / attempts left; guests get "Sign in to take the quiz" (returns to `#quiz`)
- [x] `/quiz/[attemptId]` (`components/quiz/quiz-runner.tsx`), all rules from the server:
  - [x] rules screen (the attempt's own numbers, the reveal mode, the forfeit and midnight rules)
  - [x] timed question: countdown ring from the server's `remainingMs` (device clock doesn't matter), red for the last 3 s; at 0 it sends `optionIndex: null`
  - [x] feedback after each answer when the quiz reveals answers (right/wrong, correct option, explanation); "Answer saved" otherwise; "Time's up!"
  - [x] leaving pauses with `fetch(..., { keepalive: true })` on `visibilitychange` / `pagehide` / navigating away; coming back shows "Quiz paused" + "You left during a question, so that one counted as wrong."
  - [x] "Pause and finish later today" between questions
  - [x] result: score ring, pass/fail, **+N coins** or why 0 (`coins.awardRule`), "ended at midnight" for expired, review of every answer, Try again / Back to the chapter
  - [x] the header coin chip updates right after a pass (`announceCoinsChanged()`)
- [x] Home quiz card: "N more quizzes today" + **Resume** links for today's paused quizzes
- [x] `/profile`: coins + coin history (plain-English reasons), today's unfinished quizzes (Resume), quiz history (score, coins, answers, chapter link). "My profile" in the account menu and the menu sheet. `/profile` and `/quiz/` are `noindex` and disallowed in robots
- [x] Attempts are labelled "Assamese · Chapter 2 · Class 3" (`attemptLabel()`), not a bare chapter title
- [x] Verified end to end with temporary students on a chapter with 10 quiz MCQs: right, wrong, timeout, leave mid-question → 7/10 pass, +10 coins (chip updates); repeat pass → 0 coins with the reason; Resume from home, chapter and profile; guest sign-in link; no console errors; tsc, lint, build (397 pages). Test MCQs and students deleted
- [x] Purchased notes on the profile (done in FD-5)

### FD-5 Notes + payments (Phase 4 frontend) — done 28 Oct 2026
- [x] Backend: notes listings (`/api/notes`, `/api/notes/:id`, `/api/users/me/notes`) now include `place` (medium, class, subject, chapter and the site link) via `withPlace()`. New test; backend 189 green
- [x] `/notes` store: medium tabs (starts on the remembered medium), class chips, All / Free / Premium; note cards say "Class 3 · Assamese · Chapter 2"
- [x] Buttons (`NoteActions`): **Download** (free, or already owned) → signed link from `GET /api/notes/:id/download`; **Buy ₹X**; guests: "Sign in to download / buy" (free notes need an account too, #27)
- [x] Buy window (`BuyDialog`):
  - [x] server quote (`/api/notes/:id/quote`) with a "Use N coins · save ₹X" switch and the struck-through price
  - [x] `POST /api/payments/orders` → Razorpay Checkout (script loaded only on Pay) → `POST /api/payments/verify` → PAID, or PENDING → polls `GET /api/payments/orders/:id` (2.5 s, ~2 min) until the server says PAID
  - [x] fully coin-covered note: server grants it, no Razorpay
  - [x] closed window: "No money was taken. Coins come back on their own"; failed payment: Razorpay's reason
  - [x] the note never unlocks in the browser; after PAID the owned list and coin chip reload (`announceNotesChanged()`, `announceCoinsChanged()`)
- [x] Home: notes preview (first 4, "See all" / "Open the notes store"); chapter page: **Notes** section (chapter + whole-subject notes); menu: Notes; profile: **My notes** with Download
- [x] Verified with temporary notes + a student with 100 coins: real store/quote/ownership APIs; Razorpay Checkout, order, verify, polling and download were stand-ins in the browser (no keys or private bucket in dev): free download, pay with coins → pending → paid → Download, closed window, failed payment, coins-only, guest view, home/chapter/profile; no console errors; tsc, lint, build (398 pages). Test data deleted
- [ ] **Real test-mode purchase** (Razorpay `rzp_test_` keys + webhook on a public URL + the private R2 bucket with its CORS rule): success, failure, closed tab (webhook-only). Blocked on #21, #24, #28

### FD-6 Static pages + polish (Phases 5–6 frontend) — done 28 Oct 2026
- [x] Backend: medium links can't take a site page's word (`RESERVED_TOP_LEVEL` in `utils/slug.ts`: about, notes, profile, quiz, login …). The automatic link skips them (`notes-2`); a manual "Change link" gets a plain 400. New test
- [x] Backend tests: fixed the flaky "socket hang up" failures (about 1 run in 3): supertest's short-lived servers + Node 26 keep-alive sockets. `tests/setup.ts` turns keep-alive off; 5 full runs in a row green (190 tests)
- [x] `/about`, `/contact`, `/privacy`, `/terms`, `/refund-policy` from `/api/content/pages/:slug` (shared `StaticPage`), "Last updated" on the three legal pages, 404 until published
- [x] Contact: email card only (no phone, WhatsApp or address); the address wraps only after the "@"
- [x] `/faq` from `/api/content/faq` (native `<details>`, `FAQPage` JSON-LD); FAQ linked in the footer and menu when items are published; `/notes` + `/faq` in the sitemap
- [x] Profile **My orders** (note, date, amount, coins, status, selectable order ID): the Contact and Refund drafts tell students to quote it. Checked every other promise in the drafts against the site (paused quizzes, My notes)
- [x] Reduced motion: transitions/animations drop to ~0 with `prefers-reduced-motion: reduce` (checked)
- [x] 360 / 390 / 1440 px, light + dark, 15 routes: no horizontal overflow
- [x] Accessibility: axe-core (WCAG 2.1 A/AA) on 15 routes. One issue fixed: amber text on the amber chip was 4.49:1, so `--brand-amber-text` is now `#9A5208` (≥ 4.9:1 on every light surface). Zero violations after
- [x] Performance (Lighthouse mobile, production build): accessibility, best practices and SEO **100** on every audited page; performance medians **90–92**
  - [x] Assamese and mono fonts no longer preloaded (they swap in when ready)
  - [x] header search, medium switcher and menu, and the buy window, load on first tap (`components/site/lazy-header.tsx`); the coin chip links to My profile (Sign out moved there + menu); unused toaster removed. JS per page about 221 → 172 KB
- [x] Pages and FAQ were published only for the test, then set back to draft (owner approval still needed, #29)
- [ ] Final 3D design pass once the client clarifies what "3D" means (#12/#37). Tokens are ready
- [ ] Assamese check on a real Android phone and iPhone
- [ ] Deploy frontend, domain + SSL (with the backend deploy, `DEPLOY.md`). Add a backend → frontend revalidate hook so admin edits show instantly (now up to ~1 minute)

### Home page matched to the client mock (28 Oct 2026, after FD-6)
- [x] Home follows `docs/design/home-page-mock.html` section by section: coin strip ("N Coins Earned · Win quizzes, get discounts" + white Redeem pill → `/notes`; guests "Earn Coins" + Join Free), quiz box ("Chapter Quiz · 10 sec/question • Pass: 7/10", Start Quiz on the right, one paragraph of rules worded as enforced), 4-across class tiles, inline section titles (title case), notes, videos, Latest News, "What is Class Course?" (mock text), mock footer (socials, one row of links, email). No visible heading above the coin strip (an `sr-only` h1 stays for screen readers and search)
- [x] Note cards as in the mock: free notes "₹0" + Download; premium "Use coins for discount" (opens the buy window with coins on) + "Pay & Download"
- [x] Coin chip moved next to the name in the header, as in the mock
- [x] **Placeholders until the admin adds content:** notes and videos show "coming soon" cards (nothing priced or clickable); Latest News shows the mock's four sources (`DEFAULT_NEWS` in `src/lib/site-links.ts`, #35) until Admin → News links has any; footer and menu always link About / Privacy / Terms & Conditions / Refund Policy / Contact, and an unpublished page shows "Coming soon" (noindex) instead of a 404
- [x] **Bug fixed (since FD-1):** pages with a sideways row (home, `/kit`) were 709 px wide on a 390 px phone: the hidden "(opens in a new tab)" text in the cards escaped the row. `scroll-row` is now `position: relative`. Earlier overflow checks missed it because mobile emulation widens the viewport to fit; checks now compare against the device width
- [x] Verified: tsc, lint, build; 360/390/1440, light + dark, guest + signed in: page exactly device-wide on all routes, axe (WCAG 2.1 AA) zero violations on the home page, no console errors from the site
- [x] Corner radii set to the mock's exact values (radius scale in `globals.css` + per element); all 15 measured home elements match

### Admin notes: PDF in the note form (29 Oct 2026)
- [x] New/Edit note has a PDF box (choose or drop) and "Show to students"; one "Create & upload" creates, uploads and publishes. Rows show an Upload PDF / Replace PDF button, and a PDF dropped on a row opens the upload window with it. Shared `uploadNotePdf()` + `PdfDrop` in `components/admin/sales/note-dialogs.tsx`
- [x] Verified against the real `classcoursenotes` bucket (create + upload + publish, then deleted); 390 px no overflow

### Sign-up: phone, confirm password, email code (29 Oct 2026)
- [x] **Backend:** `User.phone` (10-digit Indian mobile, `+91`/`0`/spaces accepted, stored as 10 digits), `User.emailVerified` (default true so older accounts and admins count as verified; `/register` sets false), `EmailVerificationCode` (hash only). `/register` emails a 6-digit code and returns no tokens; `POST /api/auth/verify-email` logs in; `POST /api/auth/resend-code` (60 s wait, same answer for unknown emails); login of an unverified account sends a code and answers 403 `EMAIL_NOT_VERIFIED`. 10-minute codes, 5 wrong tries per code, `otpLimiter`. Password reset also marks the email verified. Rules in `src/services/emailVerification.service.ts`. Migration `email_verification_phone`; 7 new tests (197 green)
- [x] **Admin:** users list and detail show the phone and an "Email not verified" badge; search finds phone numbers. Fixed "Class [object Object]" in the users list and detail
- [x] **Frontend:** register has Mobile number (+91) and Confirm password (live match hint), then the code step (`components/auth/verify-code.tsx`: auto-checks on the 6th digit, resend countdown, change email). Login shows the same step for unverified accounts
- [x] Verified with the real SMTP (Hostinger): code email delivered in ~3 s, code accepted, signed in; test account deleted
- [ ] **Owner:** the privacy draft now mentions the mobile number and the email code (`seed-data/pages.ts`), but the copy already in the database isn't overwritten. Update Admin → Pages → Privacy the same way before publishing

### Payment safety review (29 Oct 2026)
- [x] Reviewed: prices from the DB only; unlock only after server checks (signature + payment fetched from Razorpay, or signed webhook); every multi-step change in one Prisma transaction; guarded status updates; DB unique keys on access, Razorpay ids and coin ledger
- [x] **Double payment:** one open order per student and note (row lock + reuse of the same Razorpay order); a double tap or second tab gets the same checkout or 409 "already opening"
- [x] **Confirmations at the same moment:** access via `createMany skipDuplicates`, so a second payment no longer rolls back or makes the webhook fail forever; it is refunded automatically (REFUNDED, coins back); Reconcile retries a failed refund. Admin "Give to a student" made race-safe the same way
- [x] **Late payments:** stale orders are checked with Razorpay before cancelling; paid after a cancel → discount coins taken again (or flagged if spent)
- [x] Currency checked with the amount; authorized payments captured by the server (only if they match); full refunds from the Razorpay dashboard remove access and return held coins
- [x] Admin Orders: Refunded tab, refund id and date, "try refund again"; student: "Refunded" in My orders and a "you already had this note, refunded" message in the buy window
- [x] Migration `payment_safety` (`OrderStatus.REFUNDED`, `Order.refundId/refundedAt`, `CoinReason.NOTE_DISCOUNT_REAPPLIED`); 9 new/updated tests incl. concurrent checkouts and concurrent webhooks (206 green, payment file 4 runs in a row)
- [ ] **Owner:** refund-policy draft now says duplicates are refunded automatically; update Admin → Pages → Refund policy the same way (the database copy isn't overwritten)
- [ ] **With real test keys (#21/#24):** in the Razorpay dashboard subscribe the webhook to `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed`; then try a double tap, a payment in two tabs, and a dashboard refund

### Videos & news pages, Start Quiz picker, demo quizzes (29 Oct 2026)
- [x] **Backend:** `NewsLink.imageUrl` (migration `news_image`, https only, removable); public `GET /api/catalog/videos` (all visible videos, newest first, medium/class/format filters, 24 per page, classes with videos); public `GET /api/catalog/quiz-picker`; `videos` and `news` added to `RESERVED_TOP_LEVEL`; tests for all three (209 green)
- [x] **Admin:** news form has a picture (upload, preview, remove); list shows thumbnails
- [x] **Frontend:** `/videos` (filters, Shorts row, lessons grid, load more, inline play) and `/news` (picture cards); redesigned `VideoCard` (class/subject tag, amber play button, "Chapter N →") and `NewsCard` (picture on top, source chip, "Read more"); home "See all" links, menu links and sitemap entries. Checked at 390 and 1440, light and dark, no overflow
- [x] **Start Quiz fixed:** it only scrolled to the class list (and no quiz was ready anywhere: 0 MCQs in the DB). Now it opens a picker (class → quizzes by subject → Start); verified start → quiz screen as a student, sign-in prompt as a guest
- [x] **Demo content:** `npm run seed:demo` added 50 ready chapter quizzes (English Medium, Classes 2–12, 600 MCQs) + Class 11/12 practice tests; remove with `npm run seed:demo -- --remove` **before launch**. Assamese Medium has subjects but no chapters yet, so it has no chapter quizzes
- [x] Video cards all the same height (16:9 frame for every video; Shorts upright on a blurred backdrop); scrollbars removed from every sideways row (arrows for mouse users, hidden at the ends; chip rows wrap on wider screens). Measured: equal heights at 390 and 1280, no page overflow at 1024–1920
- [ ] **Owner:** remove the demo quizzes before going live

### Final check against the client mock (29 Oct 2026)
- [x] All 7 home sections present in the mock's order; header, menu, footer, class/subject/chapter screens and Previous/Next all exist
- [x] Corner radii identical to the mock (logo/socials 10, coins strip 18, Redeem 18, quiz box 18, Start Quiz 20, class tile 16, note card 14, video/news 15, about 16); content 358 px with 16 px gutters at 390; class grid 4 across
- [x] Mock wording "Daily Chapter Quiz"; quiz rules shortened (box 398 → 291 px tall on phones); about text's class range now comes from the database (no hardcoded classes); menu has "Rewards & coins" (→ coins strip, as in the mock)
- [x] Phones: no overflow on 8 routes at 320/360/390; tap targets ≥ 44 px (video "Chapter N", Forgot password, Sign in/Join free links fixed); no text under 12 px (card chips raised from 11 px); images `decoding="async"`
- [x] Production build: Lighthouse mobile medians (3 runs) — home 95, /videos 90, /news 96, chapter 94; Accessibility, Best Practices and SEO 100 on all; CLS 0. axe WCAG 2.1 AA: no violations on /, /videos, /news (390 light/dark, 1440)

### Admin matches the site's colours and logo (29 Oct 2026)
- [x] Admin colour tokens = the student site's amber/cream palette (light) and warm dark mode; dark-brown sidebar with amber active state; `text-primary` → `text-brand-amber-text` (25 places) for readable amber text
- [x] "CC" box replaced by the site's "C" `LogoMark` (sidebar, loading screen, login); login page and dashboard banner recoloured (brown panel, amber card stack, amber sign-in button)
- [x] Favicon: both apps used the default Next.js icon; now `src/app/icon.svg` with the "C" mark
- [x] axe WCAG 2 AA: no violations on login, dashboard, notes, quizzes, orders, users, subjects, storage/payments settings, FAQ, pages, news (light + dark). Fixed on the way: inactive tab text (3.8:1 → muted colour) and success badges (admin `--success` one shade darker)

### Production dashboard (29 Oct 2026)
- [x] Launch checklist removed. New `GET /api/admin/stats?days=7|30|90` (Prisma groupBy/aggregate, IST days): revenue, paid orders, new/total/active students, quizzes, pass rate, coins given — each vs the previous period; daily series; most played chapters; best-selling notes; latest orders and students; content totals; "Needs attention" only for real problems. 2 new tests (211 green)
- [x] Admin page: 7/30/90-day switch (remembered), refresh, 4 headline cards with ↗/↘ change, revenue/sign-ups/quizzes bar charts (hover readout, screen-reader table), leaderboards, activity lists, content counters linking to their pages. Checked with temporary activity at 1440 light/dark and 390: axe clean, no overflow

### Contact form, messages inbox, redesigned About / Contact / legal pages (29 Oct 2026)
- [x] **Backend:** `ContactMessage` (migration `contact_messages`; NEW/READ/REPLIED/ARCHIVED), public `POST /api/content/contact` (Zod, 5/hour per IP, spam trap, links a signed-in student), notification email to the contact address in the background with reply-to = the student (result in `emailNote`), admin list/status/delete, "N new contact messages" on the dashboard. 4 new tests (215 green)
- [x] **Admin:** Messages page (Inbox/New/Replied/Archived, search, detail panel, opening marks read, "Reply by email" opens the mail app pre-filled and marks replied, archive, delete; warns if the notification email failed)
- [x] **Frontend:** About (hero, 6 feature cards, owner's text, call to action), Contact (form + email card + quick help + socials + owner's text), Privacy/Terms/Refund (hero with last updated, readable article, "On this page" list — sidebar on desktop, fold-out on phones — other policies, contact link). Form: React Hook Form + Zod (`react-hook-form` 7.90.0, `@hookform/resolvers` 5.9.1, `zod` 3.25.76), prefilled when signed in, inline errors, counter, success screen. axe clean on all 5 pages (390 light/dark, 1440); no overflow
- [x] About redesigned with visuals: hero with the site's card art (class range, +coins, quiz pass), live numbers from new public `GET /api/catalog/stats` (classes, subjects, chapters, questions, videos; only visible content, test added — 216 green), "How it works" 3 steps, amber icon tiles, "Made in Assam" panel beside the owner's text, amber call to action. Every section the same container width (1216 px desktop, 358 px phone); amber tiles readable in dark mode
- [x] Contact form: standard placeholders (name, email, mobile); details are filled in only for a signed-in student, from their own account, with a "filled in from your account" note
- [ ] **Owner:** the privacy draft now mentions contact-form details; update Admin → Pages → Privacy the same way (the database copy isn't overwritten). Send one real test message from /contact to confirm the email reaches the contact inbox

### Client logo and favicon (29 Oct 2026)
- [x] Client's landscape logo copied to `public/brand/` in both apps (original SVG, trimmed SVG, an 18 KB WebP used on pages); square mark as WebP/PNG; favicon + Apple touch icon = the client's PNG (`src/app/icon.png`, `apple-icon.png`), replacing the CSS "C"
- [x] Site: header shows the full logo (switches to the square mark below 360 px, or below 400 px when the coin chip shows), footer shows the logo; `LogoMark` is now the client's mark image. Admin: sidebar shows the full logo (mark when collapsed), login panel shows the logo, loading screen the mark. Checked at 340/390/1440, light and dark; no overflow

### Rate limits reviewed and fixed (29 Oct 2026)
- [x] Problem: one shared login/sign-up/forgot/reset limit of 10 per 15 min per IP, counting successful sign-ins — a school lab or mobile-NAT network would lock everyone out; no per-account limit (password guessing from many IPs); forgot-password could flood an inbox; no whole-API backstop
- [x] Now: login 20 failed/15 min per IP + 5 failed/15 min per email (successes never count); sign-up 15/hour per IP; forgot 10/15 min per IP + 3/hour per email; reset 10/15 min; whole `/api` 600/min per IP (standard RateLimit headers); existing quiz/payment/search/check/contact/email-code limits kept. Forms show the server's specific message (this account vs this network)
- [x] `tests/rateLimit.test.ts` (6 cases with limits switched on: 30 successful logins pass, per-account lock incl. other casing, per-network lock, sign-up cap, forgot-password per address, API backstop + /health outside) — 222 green
- [ ] **Deploy:** set `TRUST_PROXY` to the number of proxies in front of the API, or every visitor shares the proxy's IP and its limits. A second API instance would need a shared (Redis) store

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
| 34 | **New:** The mock's 🌐 menu lists English/Assamese/Hindi/Bengali. Is that the **medium** (content) or a **translated website**? We build it as a medium switcher. Translating the whole site is a separate, larger job. | Client |
| 35 | **New:** Which news sources to list (the mock includes Al Jazeera, international news for children). The admin can edit the list. | Client |
| 36 | **New:** The mock is light only. Keep a dark mode (warm brown) or drop it? Default: keep it. | Client |
| 37 | **New:** Confirm "3D" = accents (layered shadows, gradients, 3D coin, pressable buttons) as in the mock, not a full 3D style. This would close #12. | Client |
