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

## Phase 10 — Coins: 90-day expiry per credit
### Backend
- [ ] Each credit gets `expiresAt = credited + 90 days` (days as a `coins` setting, default 90) and a remaining amount; spending uses the **oldest unexpired** coins first; new coins never extend old ones
- [ ] Expiry written as its own ledger row (`COIN_EXPIRED`), applied lazily on read + by the maintenance sweep (idempotent)
- [ ] Held coins (order discount) and refunds give back the **same** lots (see Q5)
- [ ] Back-fill: existing balances become lots credited on their original dates (migration script, dry-run first)
- [ ] `User.coins` stays the cached available balance
- [ ] Tests

### Admin / Frontend
- [ ] User detail and profile: available, expiring soon (with date), expired history
- [ ] "Coins are valid for 90 days" message on the profile, rewards strip, buy window

---

## Phase 11 — Cashfree payments and admin refunds  (blocked on sandbox keys for real testing)
### Backend
- [ ] Payment provider layer: Cashfree (active) + existing Razorpay (kept, switched off)
- [ ] Cashfree keys as an encrypted `cashfree` setting (server-only, masked) — see Q2
- [ ] Server-created Cashfree orders, server status check, signed webhook (raw body, before `express.json()`), idempotent `grantOrder` reused
- [ ] Refund API from admin against the original order: refund id, status PENDING / SUCCESS / FAILED, only "complete" when Cashfree confirms (webhook or status poll)
- [ ] Duplicate same-note refund with coins back keeps working through Cashfree
- [ ] `tests/fakeCashfree.ts` (real HTTP server, like `fakeRazorpay.ts`): success, failure, pending, duplicate callbacks, bad signature, refunds
- [ ] Sandbox run with the client's sandbox keys before switching to production

### Admin / Frontend
- [ ] Settings → Payments: Cashfree form + test; provider switch
- [ ] Orders: "Refund" button (reason, confirm), refund status
- [ ] Cashfree checkout in the buy window (branding where Cashfree allows); refund status in the student's purchase history

---

## Phase 12 — User management, helper admins, activity log
### Backend
- [ ] `User.status` ACTIVE / SUSPENDED (until, reason) / BLOCKED (reason); checked in `authenticate` on every request and at login (clear message)
- [ ] Blocked emails can't register again (`BlockedEmail` table)
- [ ] Force logout (delete refresh tokens + token version so access tokens die)
- [ ] Edit name/class/district with a change record
- [ ] Delete account (DPDP erasure): confirm, erase personal data, keep anonymised order/payment rows
- [ ] Export a user's data (JSON + readable PDF/CSV)
- [ ] Coin add/remove with written reason (exists) — expired kept separate (Phase 10)
- [ ] Roles: `SUPER_ADMIN` (Founder only) + helper admins with permissions (content, support, payments, users…); every admin route checks its permission
- [ ] `AdminActivity` log: who, what, when, reason, before/after; written for every admin change
- [ ] Content moderation: warn a user (notice), remove abusive Helpline messages
- [ ] Tests

### Admin
- [ ] Users: search + filters (name, email, class, district, status, joined), actions with reason dialogs
- [ ] User detail: profile, coins, purchases, quiz history, saved, referrals, Helpline tickets
- [ ] Team (helper admins + permissions), Activity log page

---

## Phase 13 — Parental consent for under-18 students
### Backend
- [ ] Under 18 (from DOB) → parent/guardian email asked; signed consent link emailed (expiry, resend limit)
- [ ] `ParentalConsent` record (parent email, sent, consented at, IP); account limited until recorded (see Q6)
- [ ] Existing minors: same step on next login
- [ ] No targeted ads/behavioural tracking of children (check: no analytics added)
- [ ] Tests

### Admin / Frontend
- [ ] Consent status + resend on user detail and list filter
- [ ] Sign-up step for the parent's email; parent's consent page; "waiting for consent" screen

---

## Phase 14 — Like, Save, Share; Blog; Announcements & notifications
- [ ] [backend] `Like` / `SavedItem` (user + target type + id, unique), counts, rate limited
- [ ] [backend] `BlogPost` (+ categories, featured image, draft/published, SEO) — add `blog` to `RESERVED_TOP_LEVEL`
- [ ] [backend] `Announcement` (text, image, visibility, publish window) + `Notification` (to one user or all)
- [ ] [admin] Blog editor (reuses `RichTextEditor`), Announcements, Send notice, likes/saves moderation
- [ ] [frontend] Like/Save/Share bar under headings of chapter pages and blog posts (native share + Copy link); Profile → Saved; `/blog`; notification bell / inbox; announcements on home

## Phase 15 — Refer and Earn  (client allows after launch)
- [ ] [backend] Referral code per user; referral recorded when the invited friend **registers and verifies** email; once per email; no self-referral; device/IP signals stored for review; on/off + coins per referral as settings; reward follows 90-day expiry
- [ ] [admin] Referral records, suspicious list, reverse reward (ledger), settings
- [ ] [frontend] Three-dot menu → Refer and Earn: copy/share link, history, coins earned

---

## Open questions for the client (answers change what we build)
| # | Question | Default we build until answered | Needed by |
|---|---|---|---|
| Q1 | The address is now shown on the site (PDF p.1) — confirmed, so the old "never show address" rule is dropped. Phone/WhatsApp still never shown? | Address shown, no phone (built in Phase 7) | Phase 7 |
| Q12 | District list: 35 names seeded (incl. Bajali, Biswanath, Hojai, Tamulpur, and Sribhumi for Karimganj). Correct? Add "Outside Assam"? Assamese names? | As seeded; admin can edit | Phase 8 |
| Q11 | Publish the client's policy text now, or after Phases 8–13 make it fully true (Cashfree, district, DOB, consent link, 90-day coins)? | Founder decides; text is loaded from Admin → Pages | Now |
| Q2 | PDF says Cashfree keys in "server environment variables". We keep keys **encrypted on the server** and editable by the Founder from admin (never in the browser). OK, or plain server variables only? | Encrypted admin setting, env fallback | Phase 11 |
| Q3 | 5 failed logins per 15 min **per IP** would lock a whole school Wi-Fi. OK to apply 5 per **account** (growing wait) with a looser per-IP limit? | 5 per account, 20 per IP | Phase 9 |
| Q4 | Same-note duplicate payments are refunded automatically today. Keep automatic, or wait for the Founder's approval? | Keep automatic | Phase 11 |
| Q5 | An order is cancelled after its held coins passed 90 days: return them expired, or with a fresh 90 days? | Return with the original expiry (expired stays expired) | Phase 10 |
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
