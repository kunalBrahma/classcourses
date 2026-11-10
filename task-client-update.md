# Class Course — Client update (requirements of 6 Nov 2026)

Source: `ClassCourse_Developer_Requirements_and_Policies_FINAL (2).pdf` (19 pages,
"Version dated 6 November 2026"; the Founder's final answers to our scope
confirmation of 5 Nov 2026). It **adds to** the v1.0 PDF; anything here wins.

Legend: `[ ]` todo · `[x]` done · `[~]` in progress · `[v]` already built, only re-check.
Tags: `[backend]` `[admin]` `[frontend]` `[all]`.

## How we work through this
- Phases are ordered **lowest risk first**. Each phase: backend → admin → frontend,
  then tests (`npm test`, `npx tsc --noEmit`, lint), then browser check at 390/1440 px
  light + dark, then **stop and report** before the next phase (CLAUDE.md rule).
- "Do not remove working features. Do not break routes, pages, data. No demo or fake data."
  (PDF p.11). Every phase ends with a regression check of the existing features it touched.
- Existing users have no district/date of birth: every new required field needs a path
  for old accounts (a "complete your profile" step), never a broken login.
- Decisions the client still has to make are in **Open questions** at the bottom. A phase
  that depends on one builds the safe default as an admin setting and lists it there.

## Already built (re-check against the new PDF, nothing to build)
- [v] Hero banners: upload, replace, remove, order, show/hide, never cropped (PDF §2.2)
- [v] Class → subjects → chapter dropdown; Q&A, extra Q&A, extra MCQs; Prev/Next in subject order, disabled at the ends (§2.3, §2.4)
- [v] Quiz: 10 questions, 10 s each, pass 7/10, pause lasts the IST day only (§2.5)
- [v] Coins only on the **first pass of each chapter** (`coins.awardRule = firstPassPerChapter`, default) (§2.5)
- [v] Daily quiz limit 10, admin setting (`quiz.dailyLimit`) (§2.5)
- [v] Free notes need login; premium notes unlock only after server-verified payment (§2.6)
- [v] Admin sets free/premium and price per PDF (§2.6)
- [v] Videos: admin pastes a YouTube link, thumbnail automatic, plays inside the site, shows its chapter (§2.7)
- [v] News: admin-managed sources and links, open the original article (§2.8)
- [v] Language: English default + Assamese only (§2.9)
- [v] Google login (built 5 Nov, **not committed yet**) (§2.10)
- [v] Same-note duplicate payment refunded automatically with its coins (§3 Refunds)
- [v] Brand colours (amber/ink/cream), no default blue, admin included (p.2)
- [v] Social links editable in admin (§4)
- [v] Helpline/contact messages already reach Admin → Messages (p.1)

---

## Phase 7 — Policies, operator details, Helpline, checkout box, video filter  (lowest risk) — done 6 Nov 2026
No auth, payment or coin logic changes. Only settings, text and UI.

### Backend
- [x] New `operator` settings group (public, no secrets, generic admin edit): `operatorLine`,
      `address`, `grievanceName`, `grievanceDesignation` ("Founder, Class Course"; never "CEO"),
      `grievanceEmail`, `replyWithinHours` (48), `resolveWithinDays` (7). Defaults = the PDF's values.
- [x] Page tokens `{{operator.line|address|grievanceName|grievanceDesignation|grievanceEmail|replyWithinHours|resolveWithinDays}}`
- [x] Client's own Privacy Policy, Terms and Conditions and Refund Policy (PDF Part 5) as the
      **standard text**, now in `backend/src/content/pages.ts` (the seed re-exports it from
      `prisma/seed-data/pages.ts`). Contact draft rewritten as "Helpline"; FAQ wording no longer names Razorpay.
- [x] `GET /api/admin/pages/:slug/standard` → `{ standard: { title, bodyHtml, preview }, matchesCurrent }`; saves nothing
- [x] Helpline topics **Refund / Bug or Error / Other Help / My data (see, correct or delete)**; the six earlier topics are still accepted (old messages, open tabs)
- [x] Admin Messages: `?topic=` filter + `topics` in the response
- [x] Purchase confirmation: `POST /api/payments/orders` needs `parentConfirmed: true`; stored as `Order.purchaseConfirmedAt` (migration `order_purchase_confirmation`, one nullable column)
- [x] Public videos: `subject` filter (with medium + class) and a `subjects` list
- [x] Tests: operator tokens + settings, standard text, Helpline topics + filter, unticked box refused, subject filter. **240/240 green, 4 runs in a row.**
- [x] Fixed random test failures (another local process answered some requests): `api()` now uses one server per test file on 127.0.0.1, started in `tests/setup.ts`

### Admin
- [x] Settings → General: "Operator & Grievance Officer" card
- [x] Pages editor: banner + "Load the standard text" (confirm, fills the editor, not saved until Save; says when the page already uses it); labels renamed Helpline / Terms and Conditions / Refund Policy
- [x] Messages: topic filter chips
- [ ] ~~Dashboard attention item for legal pages differing from the standard text~~ (optional, skipped)

### Frontend
- [x] Footer: operator line, address, Grievance Officer (name, designation, email); Privacy/Terms/Refund/Helpline always linked
- [x] About page and Helpline: "Who runs this website" card
- [x] Menu: About, Helpline → Refund, Bug or Error, Other Help, User Profile (nothing removed). The button is the mock's three-line icon (client calls it "three-dot"); not changed without approval
- [x] `/contact` = Helpline: hero with 48 h / 7 day promise, topic links, `?topic=refund|bug|help|data` preselects (own Suspense, form still prerendered), topic-specific hints
- [x] Buy window: **unticked** "My parent or guardian has permitted this purchase", Pay disabled until ticked, Terms/Privacy/Refund links in a new tab
- [x] `/videos`: subject chips after class; cards show class · subject · "Chapter N: title" (home row too)
- [x] Home order checked: banner, Rewards, Quizzes, Classes, Notes, Videos, News, About, Footer — matches the PDF (Notes/Videos are the mock's extras); unchanged
- [x] Browser check at 390 + 1440 px, light + dark (puppeteer, temporary student + videos, deleted afterwards): no sideways scroll, no console errors
- [x] CLAUDE.md: address rule updated

### Needs the Founder
- [ ] Admin → Pages → Privacy, Terms, Refund, Helpline: **Load the standard text → check Preview → Save** (live pages still show the old drafts and titles until then)
- [ ] The client's text mentions Cashfree, district, date of birth, a parent-consent link and 90-day coins. Those arrive in Phases 8–13; publish now (lawyer-reviewed) knowing the site catches up, or after those phases

## Fixes before Phase 8 (6 Nov 2026)
- [x] Sign out from the profile page (its button or the header menu) now goes straight to sign in (`useRequireSignIn()`; the quiz page too). Before, the page stayed until a reload.
- [x] Google button restyled to the site's standard (48 px, 14 px corners, card colours; no white box in dark mode). Checked at 390/1440, light/dark; taps anywhere on it open Google's sign-in.

## Phase 8 — Sign-up profile: class, district, date of birth, phone optional — done 6 Nov 2026

### Backend
- [x] `District` table (name unique, nativeName?, order, isActive), migration `student_profile`; 35 Assam districts in `src/content/districts.ts` (**client to review the names**)
- [x] `ensureDefaultDistricts()` adds the list only while the table is empty: from the seed **and at API start-up** (deploys run migrations, not the seed)
- [x] `User.districtId?`, `User.dateOfBirth?` (DATE); `classLevelId` is the student's class. No school field.
- [x] `/register` needs class, district, date of birth; phone optional (missing / "" = none)
- [x] Rules in `src/services/profile.service.ts`: real date, not future, ≥ 3 years, ≥ 1900; age in IST (18 on the birthday); active class/district only
- [x] `/api/auth/me`: `profileComplete`, `missingProfile`, `dateOfBirth`, `age`, `isMinor`, class, district
- [x] `GET /api/auth/profile-options` (active classes + districts); `PATCH /api/users/me/profile` (one field at a time; phone missing = keep, "" = remove; **date of birth set once**, later changes via Helpline)
- [x] Admin: `/api/admin/districts` list (with student counts) / create / rename / hide / reorder (full list) / delete refused while used (409); users list filters `classLevelId`, `districtId`, `profile=complete|incomplete` (combined safely with search); detail has profile + `signsInWithGoogle` (Google id never sent)
- [x] `welcome` added to `RESERVED_TOP_LEVEL`
- [x] Tests: `tests/profile.test.ts` (12) + updated sign-up tests; `signupProfile()` helper. **252/252**

### Admin
- [x] Catalog → Districts (add, rename, Assamese name, ↑/↓, show/hide, delete only when unused, links to its students)
- [x] Users: Class / District / Profile filters (in the URL), "Class · district · age" column, "Needs details" badge
- [x] User detail: Profile card (class, district, date of birth + age + Under 18, mobile, Google or email sign-in), missing fields flagged

### Frontend
- [x] Register: class, district, date of birth (day / month / year selects), mobile **(optional)**; clear messages ("February 2013 doesn't have a day 31")
- [x] `/welcome` "Your details": Google sign-ups and older accounts fill in what's missing; later edits of class, district, name, phone (date locked once saved)
- [x] `ProfileGate` (root layout): a signed-in student with missing details goes to `/welcome?next=…`; guests, admins and the about/help/policy/auth pages are never redirected
- [x] Sign-in (email, Google, email code) goes straight to `/welcome` when details are missing (`whereAfterSignIn`), so the next page doesn't flash
- [x] Profile: "Class · District" + "Edit my details"
- [x] `/api/auth/me` calls within 3 s share one request (header, menu, gate)
- [x] Browser check 390 + 1440, light + dark: register (request answered locally: dev SMTP is real), welcome redirect → fill → back to the page, About stays open, edit with locked date; admin districts/users/detail. No overflow, no console errors. Temporary student deleted.

### Notes
- Server-side blocking (quiz, checkout) for missing details comes with Phase 13 (consent), which needs the same gate; Phase 8 enforces it in the site.
- Deploy: migration first (API), then the site. Districts appear on the API's first start.

## Phase 9 — Login security, OTP and configurable rate limits — done 6 Nov 2026

### Backend
- [x] Forgot password by **6-digit code** (`AuthCode`, `authCode.service.ts`): valid exactly 5 minutes, a new code replaces the old one (resend once a minute), 5 wrong tries use it up, used once, only a hash stored; same answer for unknown emails. Reset also verifies the email, ends a sign-in pause and signs out every device. Old link route removed (old links show a "use a code" page).
- [x] Failed sign-ins **in the database** (`LoginThrottle`, `loginThrottle.service.ts`): per account 5 / 15 min → pause 15 min, doubling each time (30, 60 …) up to 24 h, forgotten after a quiet day; per network 20 / 15 min. Unknown emails count the same. Survives refresh, other browsers and restarts.
- [x] Clear messages: "2 tries left before sign-in is paused", "paused for 15 minutes" (429 `LOGIN_LOCKED` + `retryAfter`)
- [x] Admin accounts: own count, pause capped at 60 min, **unlock code** to the account's own email ends it at once (`/api/auth/unlock/request`, `/api/auth/unlock`; open to students too)
- [x] **Every admin sign-in attempt logged** (`AdminLoginAttempt`: signed in, wrong password, paused, unlock code sent, unlocked; IP + browser) → `GET /api/admin/security/admin-logins`
- [x] Admin can see and end a student's pause (`/api/admin/users/:id/sign-in`, `/sign-in/clear`)
- [x] `security` settings group: every request limit (`<name>Limit` / `<name>WindowMinutes`, list in `src/config/limits.ts`) and the sign-in rule, with safe bounds; limiters read it per request (no restart)
- [x] Maintenance sweep prunes idle counters
- [x] Tests: `tests/loginSecurity.test.ts` (14) + updated `rateLimit` / `smtp` tests. **267/267**

### Admin
- [x] Settings → Security & limits (wrong-password rules + all 13 request limits, recommended values shown when changed, reset)
- [x] People → Sign-in log (filters, device + IP, "N failed admin sign-ins in 24 h" warning)
- [x] User page: "Sign-in is paused" + Unpause button
- [x] Admin login: server's tries-left / pause message, "Email me an unlock code" + code box

### Frontend
- [x] Forgot password: email → code + new password (+ confirm), resend countdown, `?email=` prefill; success → sign in
- [x] `/reset-password` (old links): explains codes, links to Forgot password
- [x] Login: tries-left / pause messages; when paused, "Reset my password" and "Email me an unlock code" with a code box
- [x] Browser check 390 + 1440, light + dark (code emails answered in the browser because dev SMTP is real; wrong codes and Unpause used the real API). No overflow, no console errors. Temporary accounts, counters and log rows deleted.

### Notes
- "Likes, saves, referral" limits are added to `REQUEST_LIMITS` when those features are built (Phases 14–15).
- OTP for normal sign-in: not added (the client left it to the developer). Wrong-password pauses + unlock codes cover the risk without slowing every student's sign-in.
- The per-network sign-in limit stays at 20 (school Wi-Fi), per open question Q3.

## Phase 10 — Coins: 90-day expiry per credit — done 10 Nov 2026

### Backend
- [x] `CoinLot` per credit (amount, remaining, creditedAt, expiresAt) + `CoinLotMove` (which lots each ledger row took from / gave back to); migration `coin_expiry`
- [x] `coins.validityDays` setting (default 90; a change applies to later credits only)
- [x] `applyCoinChange` (still the only way to change a balance) locks the student row, expires due coins, then: credits → new lot; spends → **soonest-expiring first**; held coins coming back (`restoreRefId`, cancelled / refunded orders) → **the same lots with their original dates**; if such a lot has meanwhile expired, the returned coins expire at once (history shows both rows)
- [x] Expiry = its own ledger row `COIN_EXPIRED` ("Coins credited on … were valid until …"); expired coins can never be spent or used for a discount
- [x] Applied lazily before reads (`refreshCoins`: /me, coin history, checkout quote, admin user) and before every change, plus the 5-minute maintenance sweep (`expireAllDueCoins`)
- [x] Older accounts: lots rebuilt from the ledger on first use (credits dated when earned, spends replayed, refunds back to their lots) — no deploy step needed
- [x] Invariant tested: `User.coins` = sum of lot `remaining`
- [x] `GET /api/users/me/coins`: `validityDays`, `nextExpiry`, `expiredTotal`, each credit's lot (expiry / left / expired); admin user detail: `coinLots`, `nextCoinExpiry`, `expiredCoins`; quote: `coinValidityDays`; page token `{{coins.validityDays}}`
- [x] Tests: `tests/coins.test.ts` (11). **278/278**

### Admin / Frontend
- [x] Settings → Quiz & coins: "Coins are valid for … days"
- [x] User page: next to expire, expired so far, each credit "N left · valid until …" / "N expired on …"; history label for expired coins
- [x] Profile: "Coins are valid for 90 days from the day you earn them", "20 coins expire on 16 Nov", each credit's date, a separate **Expired coins** list
- [x] Home reward card, buy window ("your oldest coins are used first") and quiz result ("Valid for 90 days") say it too
- [x] Browser check 390 + 1440, light + dark with a temporary student (one expired, one expiring, one fresh credit). No overflow, no console errors. Student deleted; dev servers I started for the check stopped.

## Phase 11 — Cashfree payments and admin refunds — built 10 Nov 2026 (real sandbox test waits for the client's keys)

### Backend
- [x] `cashfree` setting (App ID, encrypted Secret key, sandbox | production; env fallback `CASHFREE_*`), saved only after Cashfree accepts the keys; `payments` setting picks the gateway for new orders (default **Cashfree**; Razorpay kept, switched off)
- [x] `Order.provider` / `cashfreeSessionId` / `cashfreePaymentId` (migrations `cashfree_refunds`, `order_provider`; old orders stay Razorpay)
- [x] Orders created on the server (our order id, amount, customer, return link, expiry just after our 30-minute hold); payment status checked on the server (`settleFromCashfree`: SUCCESS + exact amount); PENDING is never cancelled; failed/dropped payments recorded and retryable; same open order reused (one payment per order)
- [x] Signed webhook `/api/payments/webhook/cashfree` (raw body, HMAC check) for payments and refunds; idempotent (duplicate deliveries tested); unknown orders ignored; a signed event alone never unlocks
- [x] `Refund` table + `startRefund` / `setRefundStatus` / `syncRefund` / `recordGatewayRefund`: refund reference and status stored; PENDING until the gateway confirms; FAILED kept with the reason and retryable; one active refund per order; gateway-dashboard refunds recorded too
- [x] Admin `POST /api/admin/orders/:id/refund` (written reason); Reconcile checks pending refunds; maintenance sweep checks refunds pending > 2 min
- [x] Duplicate same-note payment → automatic DUPLICATE refund through Cashfree, coins back when confirmed
- [x] **Coins on refunds follow the client's rule**: back only for a duplicate (admin and dashboard refunds keep them spent) — changed from before
- [x] Secrets only on the server: never in responses, public settings or the browser (tested); production refuses `CASHFREE_API_BASE`
- [x] Dashboard "payments not set up" follows the active gateway
- [x] Tests: `tests/cashfree.test.ts` (16, against `tests/fakeCashfree.ts`: success, failure, pending, duplicate webhooks, bad signatures, wrong amount, refunds pending/success/failed/cancelled, duplicate purchase) + Razorpay tests kept. A deliberately broken amount check is caught. **294/294**

### Admin
- [x] Settings → Payments: gateway switch (Cashfree / Razorpay), Cashfree keys (Test, Save, sandbox/production with a confirm for real money, webhook URL + events), Razorpay below
- [x] Orders: gateway and its references, **Refund** button with a reason dialog, refund history (status, reason, gateway reference, failure), "Check the refund", "Refund pending/failed" badges in the list
- [x] Fixed: the order panel overflowed with the long Cashfree order id

### Frontend
- [x] Buy window opens Cashfree's own window (v3 SDK, loaded only when paying, our dialog hidden meanwhile), then asks the server; pending payments keep being checked; a failure stops with the gateway's message
- [x] `/checkout/return?order_id=` for redirect-style payments (server asks Cashfree; paid / failed / still confirming / not found)
- [x] Profile orders: "Refund of ₹… in progress", "₹… refunded on …" with the reference, or "a problem… our team is on it"
- [x] Browser walk-through with a local fake Cashfree + a stand-in for its window: buy → unlocked, return page, admin refund → pending → check → refunded, student sees it; 390 + 1440, light + dark; no overflow, no console errors. Test data, fake server and dev servers removed.

### Before going live (needs the client)
- [ ] Client enters **sandbox** keys in Admin → Settings → Payments (never by chat/email); add the webhook URL in the Cashfree dashboard (Payment + Refund events, version 2023-08-01)
- [ ] Sandbox run on the live site: success, failure, pending, a refund (the client's testing list, PDF p.12)
- [ ] Switch to production keys after that and a final check; rotate the keys that were in the shared APIKey file
- [ ] Q13: Cashfree needs a phone on every order; students without one send a placeholder. Confirm with Cashfree/client that this is acceptable, or ask for the phone at checkout

## Phase 12 — User management, helper admins, activity log — done 10 Nov 2026

### Fixes first (payments)
- [x] Switching the payment gateway is refused unless that gateway's saved keys are accepted by it right now
- [x] A pending Razorpay refund is confirmed by asking Razorpay (Reconcile + sweep), like Cashfree

### Backend
- [x] `User.status` ACTIVE / SUSPENDED (until a date or until lifted) / BLOCKED / DELETED, `statusReason`, `tokenVersion`; `BlockedEmail`; `AdminActivity`; `adminLevel` SUPER | HELPER + `adminPermissions` (migration `user_management`; existing admins stay full Super Admins, no data change)
- [x] `authenticate` checks the account on every request (suspended / blocked → 403 with the reason; old tokens after "sign out everywhere" → 401); sign-in, Google and refresh refuse with a clear message; blocked emails can't sign up (email or Google)
- [x] Users: suspend (date or until lifted) / lift, block / unblock (Super), sign out everywhere, edit details (before/after kept), export everything as a JSON file, erase (Super; type the email; personal data deleted, payment records kept anonymously), status filter
- [x] Helper admins: Team (Super) adds an existing account or a new one with sections (Content, Quiz reports, Notes & orders, Students, Helpline); every admin route mapped in `config/adminAccess.ts`; settings, security, Team, activity log, block, erase, role changes stay Super-only; removing a helper signs them out
- [x] Activity log for every admin change (who, what, when, reason, before/after; secrets hidden), plus exports; Super-only `GET /api/admin/activity` with search and admin filter
- [x] Tests: `tests/userManagement.test.ts` (12). **308/308**

### Admin
- [x] User page: Account card (status, reason, Edit details, Suspend…, Lift, Sign out everywhere, Download their data, Block…/Unblock and Erase… for the Super Admin), every action with a reason
- [x] Users list: account status filter and badges
- [x] Team page (add helper, tick sections, remove); Activity log page (search, admin filter, details)
- [x] Sidebar shows a helper only their sections; other pages show "You don't have access to this section"

### Frontend
- [x] A suspended / blocked student is signed out on their next request and the sign-in page shows the reason

### Checked in the browser
- [x] Super Admin suspends from a phone → the signed-in student lands on sign-in with "suspended until 31 December 2099. Reason: …"; the activity log shows it with before/after; Team adds a Content-only helper, whose sidebar shows only Overview + Content and who gets "no access" on Users. No overflow, no console errors. Test accounts and log rows removed.

### Moved to later phases (they need their features first)
- Notices to one user / all users, and "warn the user" → Phase 14 (announcements & notifications)
- Referral records and fraud review → Phase 15; parental consent status → Phase 13

## Phase 13 — Parental consent for under-18 students — done 10 Nov 2026
### Backend
- [x] `ParentalConsent` (one per student: parent email, status PENDING / GRANTED / DECLINED / WITHDRAWN, link hash + expiry, last sent + count, parent's name + parent/guardian, when, how — parent's link or admin — IP, browser, admin note); migration `parental_consent`
- [x] All rules in `src/services/consent.service.ts`. Under 18 (from the date of birth, IST) and not GRANTED → **limited** (Q6 default): free content only; quiz start/next/answer and `POST /api/payments/orders` refuse with 403 `CONSENT_REQUIRED` (`requireFullAccess`). No date of birth → `NO_DATE_OF_BIRTH`. `/api/auth/me` returns `access`.
- [x] Student asks: `POST /api/users/me/consent` (parent's email, not their own) + `/resend`; 60 s wait between sends, `parentConsent` limit (5/hour per student); a new link replaces the old one
- [x] Parent's link (public, `/api/consent/:token`, `consentLink` limit per network): one use, expires (`consent.linkValidDays`, 7), name + parent/guardian + "I'm 18 or older" required; grant or decline
- [x] `consent` setting (`required`, `linkValidDays`) so the lawyer's answer (Q9) is a switch, not code
- [x] Admin: `GET /users/:id/consent`, `/consent/resend` (Students section), `/consent/record` and `/consent/withdraw` (Super Admin, written reason, activity log); users list `consent=missing|granted`
- [x] Erase removes the record; data export includes it
- [x] No ads, analytics or tracking scripts on the site (checked: none)
- [x] Tests: `tests/consent.test.ts` (11); helper `createUserAndLogin` students are adults by default. **319/319**, twice

### Admin
- [x] User page: "Parent's permission" card (status, email, name, when, how, IP/browser, note; Send the link again; Record / Withdraw for the Super Admin)
- [x] Users list: "Parent's permission" filter + "Under 18 · given / waiting …" under the class
- [x] Settings → General: "Parent's permission" switch + link validity

### Frontend
- [x] `/parent-consent`: ask for the parent's email, waiting screen with resend countdown, declined / withdrawn / expired messages. Minors who were never asked are sent there after sign-in and by `ProfileGate` (existing minors too)
- [x] `/consent/[token]`: the parent's page (what we store, links to Privacy/Terms, name, parent/guardian, 18+ box, give / don't give), done / expired / invalid states; `notranslate`, `noindex`
- [x] Banner under the header for minors without permission ("See status" / "Ask a parent"); quiz and buy windows show the server's message
- [x] Browser check 390 + 1440, light + dark: banner, waiting screen, parent page (missing-field error, then permission given), admin card / list / settings. No overflow, no console errors. Emails stubbed; test student deleted.

### Notes
- Coins already earned and notes already bought stay when permission is withdrawn; only new quizzes and purchases stop.
- Q6 (what minors can do while waiting) and Q9 (lawyer) are still open; both are settings / one rule in `consent.service.ts`.

---

## Phase 14 — Like, Save, Share; Blog; Announcements & notifications — done 10 Nov 2026
### Backend
- [x] `Like` / `SavedItem` (one per student and item; item = chapter page or blog post, cascade on delete); migration `likes_blog_announcements_notifications`
- [x] `src/services/reaction.service.ts`: total + liked/saved (`GET /api/reactions`, optional sign-in), `PUT /api/reactions/like|save {chapterId|blogPostId, on}` (only public items; double taps can't double-count), Profile → Saved (`GET/DELETE /api/users/me/saved`, unpublished items marked unavailable). Limits `likes` / `saves` (60/min per student) in `REQUEST_LIMITS`
- [x] Blog (`src/services/blog.service.ts`): `BlogCategory` + `BlogPost` (draft/published, publish date incl. future, featured image with its size, excerpt, SEO title/description, automatic link fixed on rename); public `/api/content/blog`, `/blog/:slug` (+3 related), `/blog-slugs`; admin `/api/admin/blog/posts|categories` (reorder, hide, delete keeps posts)
- [x] Announcements (`announcement.service.ts`): text, picture, link + button text, visibility (everyone / signed-in students, optionally one class), publish switch, start/end; public `/api/content/announcements` (optional sign-in); admin CRUD + reorder (new ones first)
- [x] Notifications (`notification.service.ts`): `Notification` (to one student or everyone) + `NotificationRead`; inbox `/api/users/me/notifications` (+ `/unread`, `/read`); admin `POST /api/admin/notices` (notice to everyone; notice or **warning** to one student, optionally **emailed** — `sendNoticeEmail`, result kept as `emailNote`), list, remove. The site notifies on: refund completed, parent's answer, admin coin change
- [x] Admin access: blog/announcements → Content; notices/reactions → Students. Activity log for blog, announcements, notices, like/save removals
- [x] User detail: warnings count, likes, saves. Erase deletes likes, saves and personal notices; export lists them
- [x] `RESERVED_TOP_LEVEL` + blog, saved, notifications, announcements
- [x] Tests: `tests/engagement.test.ts` (14). **333/333**

### Admin
- [x] Blog → Posts (status tabs, category, search; editor with title, link, rich text, featured image, category, publish/unpublish, date, More options: summary + Google title/description, delete) and Categories (add, rename, hide, reorder, delete)
- [x] Announcements (list with Live/Hidden/Starts/Ended, publish switch, reorder; dialog with picture, link picker, who sees it, window)
- [x] Notices (send to everyone / one student with search, notice or warning, "also email it"; sent list with read state and email result; `?to=<user>`)
- [x] Likes & saves (totals, most liked / saved, latest likes or saves with remove, one student's view + "Remove all likes")
- [x] User page: "Notices and activity" card (warnings, likes, saves, Send a notice or warning)

### Frontend
- [x] Like / Save / Share / Copy link bar under the heading of chapter pages and blog posts (native share only where the device has it; guests are sent to sign in)
- [x] `/blog` (category chips, pages) and `/blog/[slug]` (cover shown whole, read time, related, Article JSON-LD, SEO metadata); sitemap lists posts
- [x] `/saved` + Saved section in the profile (open, remove, empty state); menu: Blog, Saved Content, Notifications
- [x] Header bell (unread count, signed-in only) → `/notifications` (marks read)
- [x] Home: Announcements under the banners (server-rendered for everyone; a student's own added after sign-in; hidden when none)
- [x] Browser check 390 + 1440, light + dark: student (home, blog, post like/save, chapter save, saved, inbox, profile), admin (posts, editor, categories, announcements + dialog, notices, likes & saves, user card). No overflow, no console errors. Notices tabs fixed for phones. Test data deleted.

### Notes
- Notices to everyone are not emailed (bulk email over SMTP would hit limits); a single student's notice can be.
- New students also see notices to everyone from the last 30 days.

## Phase 15 — Refer and Earn — done 10 Nov 2026
### Backend
- [x] `Referral` (inviter, new account — one each, email hash, status PENDING / REWARDED / HELD / REJECTED / REVERSED, reason, coins, sign-up network + device + browser, review note) and `User.referralCode` / where the inviter last opened the Refer page; coin reasons `REFERRAL_REWARD`, `REFERRAL_BONUS`, `REFERRAL_REVERSED`; migration `refer_and_earn`
- [x] `referral` setting (public): on/off (**off**), coins per referral (**0**), friend's welcome coins (0), rewards per inviter per day (5), sign-ups from one network/device per inviter in 30 days (3). Q7 defaults until the Founder sets them in Admin → Refer and Earn
- [x] Rules only in `src/services/referral.service.ts`: recorded at sign-up (or a brand-new Google account), paid only after the email is verified; coins through `applyCoinChange` (90-day lots); one reward per email ever (normalised hash: case, +tags, Gmail dots; survives erasure); no self-referral, no attaching existing accounts, codes of suspended/blocked inviters ignored
- [x] Held for review instead of paid: the inviter's own device or network, too many sign-ups from one network/device, over the daily limit, inviter under 18 without a parent's permission. A minor friend gets no welcome coins
- [x] Student `GET /api/users/me/referrals` (code, totals, history with first names only); public `GET /api/referrals/invite/:code` (`referralLink` limit); sign-up and Google sign-in accept `referralCode` + `deviceId`; CORS allows `X-Device-Id`
- [x] Super Admin: `/api/admin/referrals` (+ `/summary`), approve / reject / reverse with a written reason (reverse takes back what's left, reports what was already spent), activity log; dashboard "N referrals waiting for your review"; inviter and friend notified when coins are added; data export lists referrals
- [x] Tests: `tests/referral.test.ts` (9). **342/342**

### Admin
- [x] People → Refer and Earn (Super Admin): settings, totals, most invites, list with network/device signals, Review / Rewarded / Waiting tabs, approve / reject / reverse dialogs; user page link
- [x] Coin history labels for the referral reasons

### Frontend
- [x] `/register?ref=CODE` remembers the code for 30 days (also for a later Google sign-up) and shows "Rohan invited you"; a random device id goes with the sign-up
- [x] `/refer`: link (copy, share, code), totals, how it works, friends who joined with status; menu "Refer and Earn" (only when switched on); profile link; coin history labels
- [x] Browser check 390 + 1440, light + dark (inviter page, profile coins, menu, invite note on sign-up, admin review + approve). Found and fixed: CORS blocked the `X-Device-Id` header. No overflow, no console errors. Test data and the setting row deleted.

---

## Requirements gap check — 10 Nov 2026
Checked the PDF line by line after Phase 15. Two user-management gaps fixed:
- [x] Users list: "Joined" filter (today, 7/30/90 days, this year, before this year); API `joinedFrom` / `joinedTo` (IST days)
- [x] User page: Purchases (latest orders + refund state), Helpline messages, Saved, Refer and Earn (invited + "joined with X's link"), beside the existing coins, quizzes, consent and notices. Tests: `tests/userDetail.test.ts`. **344/344**

Still needs the client or go-live: Cashfree sandbox run with the client's keys (Q8, and rotate the exposed keys); the Founder's own Super Admin account on production; publishing the policy pages after the lawyer (Q9); Refer and Earn coins (Q7); MCQs supplied as PDF must be typed or put in a spreadsheet (the importer reads spreadsheets); Cashfree checkout branding in Cashfree's dashboard; written cost and time (Q10); Q3, Q12, Q13.

---

## Open questions for the client (answers change what we build)
| # | Question | Default we build until answered | Needed by |
|---|---|---|---|
| Q1 | The address is now shown on the site (PDF p.1) — confirmed, so the old "never show address" rule is dropped. Phone/WhatsApp still never shown? | Address shown, no phone (built in Phase 7) | Phase 7 |
| Q13 | Cashfree requires a customer phone on every order; ours is optional. Students without one send a placeholder (9999999999). OK, or ask for a phone at checkout? | Placeholder | Phase 11 go-live |
| Q12 | District list: 35 names seeded (incl. Bajali, Biswanath, Hojai, Tamulpur, and Sribhumi for Karimganj). Correct? Add "Outside Assam"? Assamese names? | As seeded; admin can edit | Phase 8 |
| Q11 | Publish the client's policy text now, or after Phases 8–13 make it fully true (Cashfree, district, DOB, consent link, 90-day coins)? | Founder decides; text is loaded from Admin → Pages | Now |
| Q2 | PDF says Cashfree keys in "server environment variables". We keep keys **encrypted on the server** and editable by the Founder from admin (never in the browser). OK, or plain server variables only? | **Built:** encrypted admin setting with env fallback (`CASHFREE_*`); either works | Phase 11 |
| Q3 | 5 failed logins per 15 min **per IP** would lock a whole school Wi-Fi. OK to apply 5 per **account** (growing wait) with a looser per-IP limit? | 5 per account, 20 per IP | Phase 9 |
| Q4 | Same-note duplicate payments are refunded automatically today. Keep automatic, or wait for the Founder's approval? | **Built:** automatic (refund completes when Cashfree confirms) | Phase 11 |
| Q5 | An order is cancelled after its held coins passed 90 days: return them expired, or with a fresh 90 days? | **Built:** returned with the original expiry (expired stays expired, shown in the history) | Phase 10 |
| Q6 | Under 18 waiting for parent consent: what still works? | Browse free content; no quizzes, coins, purchases, Helpline replies by email only | Phase 13 |
| Q7 | Referral: coins per referral? Does the invited friend also get coins? "Eligible" = registered + verified email? | 0 until set; inviter only; verified email | Phase 15 |
| Q8 | Cashfree **sandbox** keys entered by the client in Admin → Settings → Payments (never by chat/email) | — | Phase 11 testing |
| Q9 | Lawyer review of the policy text (client said they will) | Publish client's text as given | Launch |
| Q10 | Written cost and time for the full list (client asked before further development) | — | Now |

## Resolved by this PDF (close in `task.md → Waiting on client`)
#3 address shown · #4 policy text supplied · #8 daily limit 10 confirmed · #18 Class 1–12 ·
#25 coins first pass per chapter only · #27 free notes need login · #29 legal text replaces drafts ·
#30 parental consent = parent email + consent link · #35 news sources listed (India Today,
Indian Express, Just Rangaloo Things, Al Jazeera, Google News)
