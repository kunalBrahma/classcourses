# Class Course — Build Plan

> Sources: the client's requirements PDF (v1.0, 28 Sep 2026) and the
> dailyassam.com "Assamese Medium Question Answer" screenshot the client sent.
> Progress is tracked in `task.md`. Rules for Claude are in `CLAUDE.md`.

## 1. Overview & scope

Class Course is an online learning platform for students of Assam. Students
choose a **Medium**, then a **Class**, a **Subject** and a **Chapter**. Each
chapter page has:

- About the lesson / author
- Textbook question-answers
- Extra advanced question-answers
- Extra MCQs
- Videos (YouTube embeds from the Class Course channel)
- Premium PDF notes (paid through Razorpay, with a coin discount)
- A timed quiz: 10 questions, 10 s each, pass at 7 or more. A pass earns coins.
- **Previous Chapter / Next Chapter** buttons (mandatory)

Other parts of the site:

- Static pages: About Us, Contact (email only), FAQ, Privacy Policy, Terms of
  Service, Cancellation/Refund Policy.
- Social links (YouTube, LinkedIn, X, Facebook, Instagram) in the header and footer.

The PDF only defines Class → Subject → Chapter. The client's screenshot adds a
**Medium** level. Medium is admin-managed and flexible, and **each medium has
its own subject list**.

| App | Stack | Role |
|---|---|---|
| `backend` | Express 4 + Prisma 7 + Postgres | API, quiz engine, coins, Razorpay, Cloudflare R2 storage |
| `frontend` | Next.js App Router + Tailwind | Public student site |
| `admin` | Next.js App Router + Tailwind | Owner's content & settings panel |

## 2. Data model (Prisma)

| Model | Key fields | Purpose |
|---|---|---|
| `User` (extend) | `role STUDENT\|ADMIN`, `coins Int`, `mediumId?`, `classLevel?` | Auth, as in the boilerplate. `coins` is a cached balance. |
| `Medium` | `name`, `nativeName`, `slug @unique`, `order`, `isActive` | e.g. "Assamese Medium" / "অসমীয়া মাধ্যম". Created from admin. |
| `ClassLevel` | `name`, `nativeName?`, `slug @unique`, `order`, `isActive` | Admin-managed classes (Class 1–12 seeded; add LKG, Class 13, …). Shared by all mediums. |
| `Subject` | `mediumId`, `classLevelId`, `name`, `nativeName?`, `slug`, `order`, `isActive`; `@@unique([mediumId, classLevelId, slug])` | Separate list for each medium and class. |
| `SubjectPart` | `subjectId`, `title`, `order` | Optional grouping: "Part 1", "Book 1", "Writing Skills". |
| `Chapter` | `subjectId`, `partId?`, `number`, `title`, `slug`, `order`, `aboutHtml?`, `isPublished` | `order` is global within the subject and drives Prev/Next. |
| `Question` | `chapterId`, `kind QA\|MCQ`, `source TEXTBOOK\|EXTRA`, `question`, `answer?`, `options Json?`, `correctIndex?`, `explanation?`, `difficulty?`, `order` | Q&A and MCQs. `explanation` and `difficulty` stay optional until the client decides. |
| `Video` | `chapterId?`, `subjectId?`, `youtubeId`, `title`, `order` | YouTube embed. |
| `Note` | `chapterId?`, `subjectId?`, `title`, `description?`, `pdfKey`, `pricePaise`, `isFree`, `maxCoinDiscountPaise?`, `isActive` | Premium PDF. The file sits in private storage. |
| `Order` | `userId`, `noteId`, `razorpayOrderId @unique`, `razorpayPaymentId?`, `amountPaise`, `coinsUsed`, `status CREATED\|PAID\|FAILED` | One Razorpay order per purchase. |
| `NoteAccess` | `userId`, `noteId`, `orderId?`; `@@unique([userId, noteId])` | Access is granted only after verified payment, or when the note is free. |
| `Quiz` / `QuizChapter` / `QuizQuestion` | Admin-built quiz over any chapters of one medium + class: `pickMode RANDOM\|FIXED`, filters (sources, difficulties, `difficultyMix`, `onlyQuizMarked`), rule overrides (`questionCount`, `secondsPerQuestion`, `passMark`, `coinsPerPass`), `shuffleQuestions`, `shuffleOptions`, `answerReveal AFTER_EACH\|AT_END\|NEVER`, `maxAttemptsPerStudent`, `availableFrom/Until`, `isPublished`; placement `chapterId?` / `subjectId?` (else the class page) | Quiz builder (custom quizzes). |
| `QuizAttempt` | `userId`, `chapterId?`, `quizId?` + `quizTitle` snapshot, `optionOrders` (shuffled options), rule snapshots, `questionIds Json`, `answers Json`, `currentIndex`, `questionDeadline`, `status IN_PROGRESS\|PAUSED\|PASSED\|FAILED\|EXPIRED`, `score`, `dayKey` (IST `YYYY-MM-DD`) | Server-side quiz state. |
| `CoinTransaction` | `userId`, `delta`, `reason QUIZ_PASS\|NOTE_DISCOUNT\|ADMIN_ADJUST`, `refId?` | Append-only ledger. |
| `Setting` | `key @unique`, `value Json` | Quiz config, coin rules, social links, contact email, static page content. |

Default `Setting` rows:

- `quiz`: `{ questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 7, dailyLimit: 10 }`
- `coins`: `{ perPass: null, coinValuePaise: null }`. Both are PENDING from the client.
- `social`: the five openinapp links from the PDF §1.3.
- `contact`: `{ email: "about.classcourse@gmail.com" }`. Replace it once the business email exists.
- `storage`: `{ provider: "r2", endpoint, bucket, accessKeyId, secretAccessKeyEnc, publicUrl?, signedUrlTtlSeconds: 300 }`.
  The secret is encrypted. See §6a.

## 3. Seed plan (`inject_prisma_seed`)

- Seed ClassLevel "Class 1"…"Class 12" (`class-1`…`class-12`); admins add/rename/reorder the rest.
- **English Medium** (`english-medium`) gets the PDF list for Classes 2–12
  (Appendix A). The seed creates placeholder chapters `Chapter 1 … N`, grouped
  into parts where the PDF gives parts.
- **Assamese Medium** (`assamese-medium`, অসমীয়া মাধ্যম) gets the screenshot
  list for Classes 1–12 (Appendix B). Chapter counts are not known yet, so the
  seed creates **subjects only**. The admin adds chapters later.
- The seed is idempotent (upsert on slugs), so running it again is safe.
- ⚠ The client still has to confirm that the PDF list belongs to English Medium.

## 4. Backend API

> **Built in Phase 1.** Catalog routes are prefixed `/api/catalog`:
> - `GET /mediums`
> - `GET /mediums/:medium` (classes)
> - `GET /mediums/:medium/classes/:n` (subjects plus chapter groups, for the dropdown)
> - `GET …/subjects/:subject`
> - `GET …/subjects/:subject/chapters/:chapter` (with `prev`, `next` and `position`)
>
> The admin catalog routes live under `/api/admin/{mediums,classes,subjects,parts,chapters}`.
> See `CLAUDE.md` → "Catalog backend".
>
> **Built in Phase 2.** The chapter payload adds `content` (textbook/extra × qa/mcq, with MCQ answers
> withheld) and `videos`. `POST /api/catalog/questions/:id/check` reveals one MCQ answer.
>
> Admin content routes:
> - `/api/admin/chapters/:id/content`
> - `…/questions` (CRUD, reorder, `import`)
> - `…/videos`
> - `/api/admin/uploads/images`
>
> See `CLAUDE.md` → "Chapter content backend".
>
> **Phases 3–5 are built.** Their routes:
> - Quiz: `/api/quiz/*`
> - Coins: `/api/users/me/coins`
> - Notes: `/api/notes/*`
> - Checkout: `/api/payments/*`, webhook `/api/payments/webhook/razorpay`
> - Pages/FAQ: `/api/content/*`
> - Admin: `/api/admin/{users,notes,orders,pages,faq,settings/razorpay}`
>
> Static pages use `Page`/`FaqItem` tables rather than a settings group (per-page publish plus a
> "last updated" date). See `CLAUDE.md` for each phase.

Public (no auth):

- `GET /api/mediums`
- `GET /api/mediums/:medium/classes`
- `GET /api/mediums/:medium/classes/:n/subjects` returns the subjects with
  their parts and chapter titles, which feed the dropdown.
- `GET /api/chapters/:medium/:n/:subject/:chapter` returns the chapter, its
  Q&A, MCQs (without answers when used in a quiz), videos, notes and
  `prev` / `next`.
- `GET /api/settings/public` returns the social links, contact details and quiz config.

Student (JWT):

- Quiz:
  - `POST /api/quiz/start {chapterId}`
  - `POST /api/quiz/:id/answer {index, optionIndex}`
  - `POST /api/quiz/:id/pause`
  - `POST /api/quiz/:id/resume`
  - `GET /api/quiz/today`
- `GET /api/me/coins` returns the balance and the ledger.
- `GET /api/me/notes`
- `GET /api/notes/:id/download` returns a signed URL and requires `NoteAccess`.
- `POST /api/payments/order {noteId, useCoins}`
- `POST /api/payments/verify`

Razorpay:

- `POST /api/payments/webhook` checks the raw body HMAC. It is idempotent on
  the payment id.

Admin (JWT + `ADMIN`):

- CRUD for mediums, classes, subjects, parts, chapters, questions, videos,
  notes and settings.
- Reorder endpoints.
- `POST /api/admin/questions/import` takes a CSV/JSON paste for Q&A and MCQs,
  because the owner delivers content as PDFs.
- `POST /api/admin/notes/upload`
- `GET /api/admin/orders`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/coins`

All request bodies are validated with Zod through `validateBody`, and errors
go through `AppError`.

## 5. Quiz engine

**Which quizzes exist** (all rules in `backend/src/services/quizBuilder.service.ts`):
- **Automatic chapter quiz**: every chapter, random published MCQs marked
  `useInQuiz`, global rules. Off site-wide (`quiz.autoChapterQuizzes`) or per
  chapter (`Chapter.autoQuiz`).
- **Custom quizzes** (admin Quiz builder): any chapters of one medium + class,
  random (filters + optional easy/medium/hard mix) or hand-picked, every rule
  overridable (blank = global). Unset pass mark keeps the global ratio
  (7/10 → 14/20). Publishing is refused until the readiness check passes.
- Students list a page's quizzes with `GET /api/catalog/quizzes?chapterId= |
  subjectId= | mediumId&classId= (or classSlug=)` and start with `{chapterId}` or `{quizId}`.
- Answers are stored by **original** option index even when options are
  shuffled; `AT_END` / `NEVER` hide correctness and the live score until the
  end (`review[]` on finish, except `NEVER`). Coins "first pass" counts per
  custom quiz, or per chapter for automatic quizzes.

1. **Start**
   - Check the daily limit: count the attempts for today's IST `dayKey`.
   - If there is a PAUSED attempt for this chapter today, resume it instead of
     starting a new one.
   - Pick `questionsPerQuiz` random MCQs for the chapter.
   - Store their IDs and send question 1 **without** the answer.
   - Set `questionDeadline = now + secondsPerQuestion`.
2. **Answer**
   - If the answer arrives after `questionDeadline` (plus about 1 s for network
     delay), count it as wrong.
   - Record the answer, move to the next question and send it with a new deadline.
3. **Pause** keeps the state. **Resume** works only while `dayKey == today(IST)`
   and restarts the current question's timer.
4. **Finish**
   - Score ≥ `passMark` → `PASSED`. Award coins in one `$transaction`: add a
     `CoinTransaction` row and increment `User.coins`.
   - Otherwise → `FAILED`.
5. **Expiry**: any PAUSED or IN_PROGRESS attempt with `dayKey < today(IST)` is
   `EXPIRED`. This is applied lazily when attempts are read, and optionally by
   a nightly job.

The client shows the guidelines from PDF §5.1 before the quiz starts, and a
visible 10 s countdown on each question.

## 6. Payments (Razorpay)

1. `POST /payments/order`
   - Load the note.
   - If the student chose to use coins, work out the coin discount (capped by
     `maxCoinDiscountPaise` and the student's balance).
   - Create a Razorpay order on the server and save an `Order` with status `CREATED`.
2. The frontend opens Razorpay Checkout. When checkout succeeds, the frontend
   sends the response to `POST /payments/verify`, where the server checks the
   HMAC signature.
3. The webhook `payment.captured` is the authority. It also covers a closed tab.
   In one transaction it:
   - sets the order to `PAID`
   - creates `NoteAccess`
   - deducts the coins as a `CoinTransaction` of type `NOTE_DISCOUNT`
   - is idempotent
4. Downloads use `GET /notes/:id/download`, which checks `NoteAccess` and
   returns a presigned R2 URL that lasts a few minutes. The bucket is private
   (see §6a).
5. Razorpay compliance needs these pages to be live before KYC: Terms, Privacy,
   Contact and Cancellation/Refund.

## 5a. Settings registry & email (Phase 0, built)

- **`src/services/settings.service.ts`** keeps one registry of groups.
  - Every group resolves in the order DB → env fallback → defaults.
  - Secrets are encrypted and masked. A blank secret on save keeps the stored one.
  - The groups are `quiz`, `coins`, `social`, `contact`, `site`, `storage`
    and `smtp`. `razorpay` is added in Phase 4 and `pages` in Phase 5.
- **Coin defaults** are placeholders, editable in admin, until the client
  decides:
  - 10 coins per pass
  - 1 coin = ₹0.10 (10 paise)
  - at most 50% off a note
- **Email** uses SMTP through nodemailer, in `src/services/mail.service.ts`.
  - It is configured in admin under the `smtp` group, with `SMTP_*` env vars
    as the fallback.
  - Templates live in `src/emails/`.
  - Saving runs `verify()` first. A test endpoint sends a real email.
  - With no SMTP set, dev logs the email to the console and production returns 503.
- **Tests:** `npm test` uses vitest + supertest against a separate
  `classcourse_db_test`.

## 6a. File storage — Cloudflare R2 (admin-configurable)

- **Client library:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`,
  with `endpoint = https://<accountId>.r2.cloudflarestorage.com`,
  `region = "auto"`. Scaffold it with `inject_storage_service`, then adapt it
  as below.
- **Where the config lives:** `Setting` key `storage`. It is edited in
  **Admin → Settings → Storage**. The `R2_ENDPOINT`, `R2_BUCKET_NAME`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_PUBLIC_URL` env vars
  are used only when the DB setting is empty (first boot or CI).
- **Secret handling:**
  - `secretAccessKey` is encrypted with AES-256-GCM using
    `SETTINGS_ENCRYPTION_KEY` (32-byte hex, validated in `env.ts`). This lives
    in `src/utils/crypto.ts`.
  - The GET settings response returns `secretAccessKey: "••••last4"` only.
  - On PUT, an empty secret field keeps the stored value.
- **Service** `src/services/storage.service.ts`:
  - `getClient()` caches an `S3Client` keyed by the settings row's `updatedAt`,
    so saving new settings takes effect without a restart.
  - `uploadObject(key, body, contentType)`
  - `deleteObject(key)`
  - `getSignedDownloadUrl(key, ttl)`
  - `getSignedUploadUrl(key, contentType)`, used for large direct-from-browser
    uploads in admin, because it avoids streaming big PDFs through Express.
  - `testConnection(cfg)` runs a `HeadBucket` check.
- **Admin routes:**
  - `GET /api/admin/settings/storage` (masked)
  - `PUT /api/admin/settings/storage` (Zod-validated, encrypts the secret)
  - `POST /api/admin/settings/storage/test` (tests the submitted config
    before it is saved)
- **Two buckets:**
  - `bucket`: public, for images.
  - `privateBucket`: premium notes, only ever served through signed URLs.
  - The helpers take a `visibility` argument. Paid notes can't be published
    until `privateBucket` is set.
- **Object keys:**
  - `notes/<noteId>/<uuid>.pdf` (private)
  - `images/<uuid>.<ext>` (served through `publicUrl` if the client
    enables an R2 public bucket or custom domain)
- **Bucket CORS:** the R2 bucket needs a CORS rule that allows `PUT` from the
  admin origin, for presigned uploads. Document this in the admin Storage page
  help text.

## 7. Frontend (student site) pages

| Route | Content |
|---|---|
| `/` | Hero, medium picker, class grid (admin-managed classes in their order, only active ones), how it works, social links |
| `/[medium]` | Class grid for that medium |
| `/[medium]/[class]` | Subject cards. Tapping a subject opens an **accordion dropdown of its chapters**, grouped by part. |
| `/[medium]/[class]/[subject]` | Subject landing page with the full chapter list (good for SEO) |
| `/[medium]/[class]/[subject]/[chapter]` | About the lesson, Textbook Q&A, Extra Q&A, Extra MCQs (reveal answer), Videos, Notes, "Take Quiz" button, **Prev / Next** |
| `/quiz/[attemptId]` | Guidelines, then the timed question UI, then the result and coins earned |
| `/login`, `/register` | These exist in the boilerplate |
| `/profile` | Coins balance and history, paused quizzes (today), purchased notes |
| `/notes` | Premium notes store |
| `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/refund-policy` | Static pages. The text is editable through `Setting`. |

- Content pages use Server Components with ISR (`revalidate`) and have
  `generateMetadata`, a sitemap and robots.txt.
- The quiz and profile pages are client-rendered and use `src/lib/api.ts`.

## 8. Admin panel

- **Dashboard:** counts for users, attempts today, orders and revenue.
- **Catalog tree:** Medium → Class → Subject → Part → Chapter. You can create,
  edit, reorder and toggle active for each level. Bulk "add N placeholder
  chapters" is included.
- **Chapter editor:** the About rich text, a Q&A list, an MCQ list, and a
  **bulk import** (paste CSV/JSON with a preview first).
- **Videos:** paste a YouTube URL and the ID is extracted.
- **Notes:** PDF upload, price, free toggle, coin discount cap.
- **Orders:** read-only, with a filter by status.
- **Users:** list, change role, adjust coins (written to the ledger).
- **Settings:** quiz config, coin rules, social links, contact email, static
  page content.
- **Storage (Cloudflare R2):** account ID, bucket, access key, secret (masked),
  public base URL and signed-URL TTL, with a **Test connection** button.

## 9. Design system

- The "3D" look comes from layered shadows (`--shadow-3d-sm/md/lg`), raised
  cards with a slight tilt/lift on hover, pressable buttons (a bottom border
  plus translateY on press) and gradient surfaces.
- All of this is kept in design tokens, because the client still has to
  explain what "3D" means.
- Colours and fonts are placeholders until the client decides them. The PDF
  cover suggests navy `#1f1d4a`, indigo `#4338ca` and amber `#f59e0b`.
- Fonts: `Noto Sans Bengali` for Assamese script, plus a Latin UI font
  (e.g. Inter), loaded through `next/font`.
- Mobile-first. The chapter pages must read well at 360 px. Use large tap
  targets for young students.
- Respect `prefers-reduced-motion`.

## 9b. Client home-page mock (28 Oct 2026) — review and design direction

Source: `docs/design/home-page-mock.html`. It's a
single-file click-through prototype, so it shows **look and layout**, not
behaviour. Move it to `docs/design/` (anything in `public/` is served on the
live site).

### What we adopt
- **Palette:** amber/cream replaces navy/indigo on the student site:
  amber `#F5A623`, light amber `#FFBE4D`, dark amber `#C9780C`, cream
  background `#FFF7E8`, ink `#3A2A00`, and footer brown `#2E2000`. This
  partly answers "colour scheme" (#13). Because everything is a token in
  `frontend/src/app/globals.css`, only the tokens change. The admin keeps its
  navy look.
- **"3D" means accents** (#12, to be confirmed): soft layered amber-tinted
  shadows, gradient surfaces, inset highlights, a 3D coin and pressable
  buttons. These map onto the existing `card-3d` / `press-3d` tokens. It is
  not full 3D.
- **Header:** sticky amber gradient bar with the logo, coin chip, search,
  🌐 switcher and a right-hand menu.
- **Home sections, in this order:** coin card → quiz card → class grid
  (book icons) → notes → videos row → news row → "What is Class Course?" →
  dark footer.
- **Card types:** class tiles, row cards (subject or chapter with ›),
  note cards (FREE/PREMIUM badge, price, "use coins"), video cards and news
  cards. The rows scroll sideways.

### What we change (and why)
| Mock | Problem | Our build |
|---|---|---|
| One page that swaps "screens" with JS | No URLs, so no SEO, no back button, no sharing | Real routes: `/[medium]/[class]/[subject]/[chapter]` |
| No medium step; the 🌐 menu offers English/Assamese/Hindi/Bengali | Mixes up *medium* (content) with *site language* (UI translation, which isn't in scope) | 🌐 = **medium switcher** read from the DB (remembered in a cookie). The class grid shows the classes of the chosen medium. Ask the client (#34). |
| Subject → separate chapter-list screen | The requirements ask for a **chapter accordion on the class page** | Accordion on the class page, plus a subject page for SEO |
| Text is 9.5–13.5 px | Too small for Class 1 readers, and Assamese conjuncts need more size | Body text ≥ 16 px, labels ≥ 13 px, Assamese at 17–18 px |
| White text on `#F5A623`, `#b08347` and `#9a7a3f` on white | Contrast is 2–3.9:1, which fails WCAG AA | Buttons use dark ink on amber or white on `#B45309`. Muted text darkened to ≥ 4.5:1. |
| Clickable `div`s, 30 px icon buttons, no focus ring | Not usable by keyboard or screen reader; tap targets too small | Real `<a>`/`<button>` elements, 44 px targets, visible focus ring |
| Emoji as icons (📝📚🎥) | They look different on Android, iOS and Windows | Lucide/SVG icons in the same style as the book tiles |
| "★ 120" coins for everyone; "Redeem" | Guests have no coins, and coins have no "redeem" step (they are a discount on notes) | Guests see "Sign in to earn coins". Signed-in students see their live balance. "Use coins" links to `/notes`. |
| Static 7/10 ring and "Daily Chapter Quiz" | There is no single daily quiz, because quizzes start from a chapter | Signed in: quizzes left today (daily limit), paused quizzes to resume and the last score. Guest: the rules. All numbers come from the `quiz` setting. |
| Quiz rules text | Wrong for our rules: it doesn't say that leaving **mid-question forfeits that question** | Generated from settings, with the pause rule worded as the backend enforces it |
| Coin maths in the browser (10 coins = ₹1) | Must never be computed client-side | `GET /api/notes/:id/quote` |
| Hard-coded notes, videos and news | Need admin control | Notes: `/api/notes`. Videos: new "featured" list. News: new admin-managed links. |
| Videos are a fixed 190×106 frame, autoplay `youtube.com` | Shorts get squashed, and the embed loads cookies | Shorts as 9:16 cards, long videos as 16:9. A thumbnail first, then a `youtube-nocookie` embed on tap. |
| News includes Al Jazeera (international) | Questionable for children, and the client should own this list | The admin picks the sources. Ask the client (#35). |
| Footer: About / Privacy / Terms / Contact | **Razorpay needs the Refund policy linked**; FAQ is missing | Footer lists every published page (as now) |
| `Segoe UI` font | Has no Assamese glyphs on Android | Geist + Noto Sans Bengali (already set up) |
| Light only | — | Keep dark mode with a warm brown variant, or drop it. Ask the client (#36). Default: keep it. |

### Missing backend pieces (they come first, by the phase rule)
1. **News links:** a `NewsLink` model (source, title, url, order, active)
   with admin CRUD and reorder, plus public `GET /api/content/news`.
2. **Home videos:** `Video.featured` (bool), an admin "Show on home page"
   switch and a public `GET /api/catalog/videos/featured` (published chapters
   only, with chapter link and `format`).
3. **Search:** public `GET /api/catalog/search?q=` over medium, class,
   subject and chapter names (English and Assamese), limited and
   rate-limited, returning links.
4. **Home notes teaser:** no backend work. `GET /api/notes` already returns
   notes in admin order, so the home shows the first 4 plus "See all notes".

## 9a. Development order

Work goes **phase by phase** (Phase 0 → 6 in `task.md`). Inside each phase
the order is always:

1. **Backend**
   - Prisma models and migration (run against the Docker Postgres).
   - Controllers, routes, RBAC, Zod validation.
   - `tsc` passing.
   - Smoke-tested with curl.
2. **Admin:** the screens that manage the new data, working against the real API.
3. **Frontend:** the student-facing pages that consume it.

A phase is done when all three parts are ticked in `task.md`. Only then does
the next phase start.

## 10. Local environment (already set up)

- `docker-compose.yml` has `name: classcourse`. The Postgres container is
  `classcourse-postgres-1`, the volume is `classcourse_postgres_data` and the
  DB is `classcourse_db`.
- The root `.env` sets `POSTGRES_PORT=5440` and `BACKEND_PORT=4000`, because
  5432, 5433 and 3000 are already used on this machine.
- `backend/.env` has `PORT=4000` and
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5440/classcourse_db`.
  It also has a generated JWT secret.
- `frontend/.env.local` and `admin/.env.local` both have
  `NEXT_PUBLIC_API_URL=http://localhost:4000`. Run the frontend on port 3100
  and the admin on port 3101.
- Daily loop:
  1. `docker compose up -d postgres`
  2. `cd backend && npx prisma migrate dev && npm run dev`

## 11. Deployment

- The backend and Postgres use the existing `docker-compose.yml`, deployed to
  a VPS. Run the `deploy-preflight` checks first.
- `frontend` and `admin` are hosted separately (Vercel or the same VPS).
- New env vars go in `backend/src/config/env.ts`:
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
  - `SETTINGS_ENCRYPTION_KEY` (required)
  - `R2_*` (optional fallback; normally set from admin)
  - `FRONTEND_URL`, `ADMIN_URL` (for CORS)
- Frontend env: `NEXT_PUBLIC_RAZORPAY_KEY_ID`.

## 12. Open questions (see `task.md → Waiting on client`)

1. The mission and vision text.
2. The business email.
3. Whether to show an address.
4. Chapter names and content.
5. Whether answers get explanations.
6. Whether there are difficulty levels.
7. Confirm the daily quiz limit.
8. Coin values and discount rules.
9. Which notes are free and which are premium.
10. The FAQ.
11. What "3D" means.
12. The logo, colours, fonts and images.
13. The Razorpay account.
14. **New:** confirm that the PDF subject list is for English Medium.
15. **New:** chapter counts and names for Assamese Medium.
16. **New:** any other mediums wanted at launch.

---

## Appendix A — English Medium (from the requirements PDF, Class 2–12)

| Class | Subject (chapters) |
|---|---|
| 2 | Assamese 10 · English 18 · Math 15 |
| 3 | Assamese 20 (10 parts × 2 lessons) · English 6 · Math 14 (Part 1: 4, Part 2: 2, Part 3: 4, Part 4: 4) |
| 4 | Assamese 20 · English 9 · Math 17 · Environment 12 (Part 1: 2, Part 2: 2, Part 3: 2, Part 4: 2, Part 5: 4) |
| 5 | Assamese 14 · English 8 · Math 14 · Environment 16 |
| 6 | Assamese 15 · English 8 · Social Science 15 · General Science 13 · Math 10 · Hindi 16 · Charitra 14 |
| 7 | Assamese 15 · English 18 · Social Science 15 · General Science 6 · Math 8 · Hindi 16 · IT 7 |
| 8 | Assamese 15 · English 8 · Social Science 25 · General Science 18 · Math 16 · Hindi 14 · IT 9 |
| 9 | Assamese 16 · English 12 · Social Science 13 · General Science 15 · Math 13 · Hindi 16 · Geography 8 |
| 10 | Assamese 16 · English 12 · Social Science 13 · General Science 16 · Math 14 · Hindi 12 · English Grammar 15 · Hindi Grammar 15 |
| 11 | Assamese 16 · Advance Assamese 11 · English 14 (+ separate section Writing Skills 6) · Education 7 · Economics 5 · Geography 7 · History 11 · Logic and Philosophy 15 · Political Science 20 |
| 12 | Assamese 18 · English 15 · History 16 · Economics 6 · Advance Assamese 11 · Logic and Philosophy 8 · Education 7 · Political Science 19 (Book 1: 10, Book 2: 9) · Geography 28 (Parts 1–11: 1, 3, 5, 1, 3, 1, 5, 3, 2, 2, 2) |

Notes:

- Class 3 Assamese: the PDF lists no per-part chapter split beyond "10 parts,
  2 lessons each", so it is seeded as Parts 1–10 with 2 chapters each.
- Class 11 English: Writing Skills is a separate `SubjectPart` alongside the
  main 14 chapters, which gives 20 chapters in total. The client should
  confirm whether the 14 already includes the 6.

## Appendix B — Assamese Medium (from the client's screenshot, Class 1–12)

Chapter counts are **PENDING**. The seed creates subjects only. "(E)" means
elective.

| Class | Subjects |
|---|---|
| 1 | Assamese (অসমীয়া) · English (ইংৰাজী) · Mathematics (গণিত) |
| 2 | Assamese · English · Mathematics |
| 3 | Assamese · English · Environmental Studies (পৰিৱেশ অধ্যয়ন) · Mathematics |
| 4 | Assamese · English · Environmental Studies · Mathematics |
| 5 | Assamese · English · Environmental Studies · Mathematics |
| 6 | Assamese · English · General Science (বিজ্ঞান) · Social Science (সমাজ বিজ্ঞান) · General Mathematics (গণিত) · Hindi (হিন্দী) · Charitra Path (চৰিত্ৰ পাঠ) · History (অসমৰ ইতিহাস) · Computer (কম্পিউটাৰ) |
| 7 | Assamese · English · General Science · Social Science · General Mathematics · Hindi · History (ইতিহাস) |
| 8 | Assamese · English · General Science · Social Science · General Mathematics · Hindi |
| 9 | Assamese · English · General Science · Social Science · General Mathematics · Hindi (E) · Geography (E) (ভূগোল) · History (E) · Yoga (E) (যোগ শিক্ষা) · Commerce (E) (বাণিজ্য) · Home Science (E) (গৃহ বিজ্ঞান) · Travel Tourism and Hospitality (E) · Advanced Mathematics (E) (উচ্চ গণিত) · Computer Science (E) |
| 10 | Assamese · English · General Science · Social Science · General Mathematics · Hindi (E) · Geography (E) · History (E) · Home Science (E) · Travel Tourism and Hospitality (E) · Advanced Mathematics (E) · Computer Science (E) · Commerce (E) |
| 11 | Assamese · Advance Assamese (উচ্চ অসমীয়া) · English · Hindi · Swadesh Adhyayan (স্বদেশ অধ্যয়ন) · Bihu (বিহু) · Logic & Philosophy (যুক্তি আৰু দৰ্শন) · Education (শিক্ষা) · Political Science (ৰাজনীতি বিজ্ঞান) · Sociology (সমাজ তত্ত্ব) · Geography · History · Economics (অৰ্থনীতি) · Environmental Science (পৰিৱেশ) · Biology (জীৱ বিজ্ঞান) · Physics (পদাৰ্থ বিজ্ঞান) · Chemistry (ৰসায়ন বিজ্ঞান) · Mathematics · Anthropology (নৃতত্ত্ব) · Business Studies (ব্যৱসায় অধ্যয়ন) · Accountancy (হিচাপশাস্ত্ৰ) · Finance (বিত্ত) · Computer Science |
| 12 | The same as Class 11 without Environmental Science: Assamese · Advance Assamese · English · Hindi · Swadesh Adhyayan · Bihu · Logic & Philosophy · Education · Political Science · Sociology · Geography · History · Economics · Biology · Physics · Chemistry · Mathematics · Anthropology · Business Studies · Accountancy · Finance · Computer Science |

The Assamese names above were read from a low-resolution screenshot. The
client should check the spellings before launch.
