import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  CoinsIcon,
  FileTextIcon,
  HelpCircleIcon,
  InfoIcon,
  ListIcon,
  MailIcon,
  MessageCircleQuestionIcon,
  PlayCircleIcon,
  ReceiptIcon,
  ScaleIcon,
  ShieldCheckIcon,
  TimerIcon,
} from "lucide-react";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { Coin3D } from "@/components/kit/coin";
import { LogoMark } from "@/components/kit/logo-mark";
import { AboutVisual } from "@/components/pages/about-visual";
import { ContactForm } from "@/components/pages/contact-form";
import { Container } from "@/components/site/container";
import { SocialIcons } from "@/components/site/social-icons";
import { getCatalogStats, getFaq, getPage, getSiteSettings, type SitePage } from "@/lib/server-api";
import { classBounds } from "@/lib/class-range";
import { cn } from "@/lib/utils";
import { STATIC_LINKS } from "@/lib/site-links";

export type StaticSlug = "about" | "contact" | "privacy" | "terms" | "refund-policy";

const LEGAL: StaticSlug[] = ["privacy", "terms", "refund-policy"];
const DESCRIPTIONS: Record<StaticSlug, string> = {
  about: "What Class Course is and who it's for: chapter-wise study help for students of Assam.",
  contact: "Questions about chapters, quizzes, coins or a payment? Send us a message and we'll reply by email.",
  privacy: "How Class Course collects, uses and protects your information.",
  terms: "The rules for using Class Course, its quizzes, coins and notes.",
  "refund-policy": "Refunds and cancellations for premium notes bought on Class Course.",
};
const ICONS: Record<StaticSlug, LucideIcon> = {
  about: InfoIcon,
  contact: MailIcon,
  privacy: ShieldCheckIcon,
  terms: ScaleIcon,
  "refund-policy": ReceiptIcon,
};
const KICKERS: Record<StaticSlug, string> = { about: "About us", contact: "Contact us", privacy: "Legal", terms: "Legal", "refund-policy": "Legal" };

const titleOf = (slug: StaticSlug, page: SitePage | null) => page?.title ?? STATIC_LINKS.find((l) => l.slug === slug)?.title ?? "Class Course";

export async function staticPageMetadata(slug: StaticSlug): Promise<Metadata> {
  const page = await getPage(slug);
  // The contact form works before the page text is published, so it's always indexable.
  if (!page && slug !== "contact") return { title: titleOf(slug, null), robots: { index: false } };
  return { title: titleOf(slug, page), description: DESCRIPTIONS[slug], alternates: { canonical: `/${slug}` } };
}

const updated = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// Gives the page's h2/h3 headings ids, for the "On this page" list.
const withHeadingIds = (html: string) => {
  const headings: { id: string; text: string; level: number }[] = [];
  const used = new Set<string>();
  const out = html.replace(/<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g, (_m, level: string, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").trim();
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "section";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    headings.push({ id, text, level: Number(level) });
    return `<h${level}${attrs.replace(/\sid="[^"]*"/, "")} id="${id}" class="scroll-mt-24">${inner}</h${level}>`;
  });
  return { html: out, headings };
};

function Hero({ slug, title, children }: { slug: StaticSlug; title: string; children?: React.ReactNode }) {
  const Icon = ICONS[slug];
  return (
    <header className="relative overflow-hidden rounded-3xl bg-[image:var(--header-bg)] px-5 py-8 text-brand-ink shadow-[var(--header-shadow)] sm:px-10 sm:py-12 dark:text-brand-cream">
      <span className="pointer-events-none absolute -right-6 -top-6 grid size-40 place-items-center rounded-full bg-white/15 sm:size-56" aria-hidden="true">
        <Icon className="size-16 opacity-40 sm:size-24" />
      </span>
      <div className="relative max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-wider opacity-80">{KICKERS[slug]}</p>
        <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        <div className="mt-3 text-base leading-relaxed opacity-90 sm:text-lg">{children ?? DESCRIPTIONS[slug]}</div>
      </div>
    </header>
  );
}

function ComingSoon({ email }: { email: string }) {
  return (
    <div className="card-3d rounded-3xl p-6 sm:p-8">
      <p className="font-heading text-xl font-bold text-brand-amber-text">We&apos;re finishing this page</p>
      <p className="mt-2 text-muted-foreground">It will be here soon. Until then, write to us with any question.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/contact" className="press-3d inline-flex h-12 items-center gap-2 rounded-xl px-5 font-bold">
          <MailIcon className="size-5" /> Contact us
        </Link>
        <a href={`mailto:${email}`} className="inline-flex min-h-12 items-center rounded-xl border bg-card px-5 font-semibold [overflow-wrap:anywhere] hover:bg-accent">
          {email}
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

async function AboutPage({ page }: { page: SitePage | null }) {
  const [{ site, quiz, coins }, stats, bounds] = await Promise.all([getSiteSettings(), getCatalogStats(), classBounds()]);
  const classRangeLabel = bounds ? (bounds.first === bounds.last ? bounds.first : `${bounds.first.replace(/^Class\s+/i, "Class ")} – ${bounds.last.replace(/^Class\s+/i, "")}`) : "Every class";
  const features: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: BookOpenIcon, title: "Chapter-wise Q&A", text: "Every textbook question with a clear answer, plus extra questions that go further." },
    { icon: ListIcon, title: "Practice MCQs", text: "Tap an option and see the right answer and why, as many times as you like." },
    { icon: TimerIcon, title: "Quizzes", text: `${quiz.questionsPerQuiz} questions, ${quiz.secondsPerQuestion} seconds each. Score ${quiz.passMark} or more to pass.` },
    { icon: CoinsIcon, title: "Coins & rewards", text: `Earn ${coins.perPass} coins for a pass and use them for up to ${coins.maxDiscountPercent}% off premium notes.` },
    { icon: FileTextIcon, title: "Notes", text: "Free notes, and premium PDF notes made for each chapter and subject." },
    { icon: PlayCircleIcon, title: "Videos & news", text: "Short lessons and the latest exam and education news in one place." },
  ];
  const numbers = stats
    ? [
        { value: stats.classes, label: "Classes" },
        { value: stats.subjects, label: "Subjects" },
        { value: stats.chapters, label: "Chapters" },
        { value: stats.qa + stats.mcq, label: "Questions" },
        { value: stats.videos, label: "Videos" },
      ].filter((n) => n.value > 0)
    : [];
  const steps = [
    { title: "Choose your class", text: "Pick your medium and class. We remember it for next time." },
    { title: "Study the chapter", text: "Read the answers, practise MCQs, watch a short video." },
    { title: "Take the quiz", text: `Pass with ${quiz.passMark}/${quiz.questionsPerQuiz} to earn coins for money off notes.` },
  ];
  const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);

  return (
    <div className="grid gap-10 sm:gap-14">
      {/* Hero: words + the site's card art */}
      <header className="relative overflow-hidden rounded-3xl bg-[image:var(--header-bg)] px-5 py-8 text-brand-ink shadow-[var(--header-shadow)] sm:px-10 sm:py-12 dark:text-brand-cream">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider opacity-80">About us</p>
            <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight sm:text-5xl">{titleOf("about", page)}</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed opacity-90 sm:text-lg">
              {site.name} helps students of Assam study chapter by chapter, in their own medium, on any phone. Free to start.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/#classes" className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-ink px-5 font-bold text-brand-cream shadow-[0_3px_0_rgb(0_0_0/0.35)] transition active:translate-y-0.5 dark:bg-brand-cream dark:text-brand-ink">
                Choose your class <ArrowRightIcon className="size-5" />
              </Link>
              <Link href="/#start-quiz" className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-xl bg-white/40 px-5 font-bold backdrop-blur-sm hover:bg-white/55 dark:bg-white/10 dark:hover:bg-white/15">
                Take a quiz
              </Link>
            </div>
          </div>
          <AboutVisual classRange={classRangeLabel} passMark={quiz.passMark} questions={quiz.questionsPerQuiz} coins={coins.perPass} />
        </div>
      </header>

      {/* The library in numbers (only what students can see) */}
      {numbers.length > 0 && (
        <section aria-label="Class Course in numbers">
          {/* As many columns as there are numbers, so no gap is left on wide screens. */}
          <ul className={cn("grid grid-cols-2 gap-3", ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-3 lg:grid-cols-5"][numbers.length])}>
            {numbers.map((n) => (
              <li key={n.label} className="card-3d rounded-2xl px-4 py-5 text-center">
                <span className="block font-heading text-3xl font-extrabold tracking-tight text-brand-amber-text tabular-nums sm:text-4xl">{fmt(n.value)}</span>
                <span className="mt-1 block text-sm font-semibold text-muted-foreground">{n.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How it works */}
      <section aria-labelledby="how-title">
        <h2 id="how-title" className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="card-3d relative flex gap-4 rounded-2xl p-5 md:block">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-amber-light to-brand-amber font-heading text-xl font-extrabold text-brand-ink shadow-[0_3px_0_var(--brand-amber-dark)]">
                {i + 1}
              </span>
              <div>
                <h3 className="font-heading text-lg font-bold md:mt-4">{step.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* What's inside */}
      <section aria-labelledby="what-title">
        <h2 id="what-title" className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          What you&apos;ll find here
        </h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="card-3d flex gap-4 rounded-2xl p-4 sm:block sm:p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-amber-light to-brand-amber text-brand-ink shadow-[0_3px_0_var(--brand-amber-dark)]" aria-hidden="true">
                <Icon className="size-6" />
              </span>
              <div>
                <h3 className="font-heading text-lg font-bold sm:mt-4">{title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Our story: the owner's text beside a brand panel, same full width */}
      {page && (
        <section aria-label="Our story" className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-3xl bg-footer p-6 text-footer-fg sm:p-8 lg:sticky lg:top-24">
            <span className="pointer-events-none absolute -bottom-10 -right-10 size-40 rounded-full bg-brand-amber/15" aria-hidden="true" />
            <LogoMark className="size-14 rounded-2xl" />
            <p className="mt-5 font-heading text-2xl font-extrabold leading-tight">Made in Assam, for the students of Assam</p>
            <ul className="mt-5 grid gap-2.5 text-[15px]">
              {["Free to start", "In your own medium", "Works on any phone", "Every chapter, step by step"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-amber text-brand-ink" aria-hidden="true">
                    <CheckIcon className="size-4" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card-3d rounded-3xl p-5 sm:p-8 lg:p-10">
            <div className="rich max-w-[70ch] text-[16px]" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
          </div>
        </section>
      )}

      {/* Call to action */}
      <section className="relative overflow-hidden rounded-3xl bg-[image:var(--header-bg)] p-6 text-brand-ink shadow-[var(--header-shadow)] sm:p-10 dark:text-brand-cream">
        <Coin3D className="pointer-events-none absolute -right-4 -top-4 size-28 text-4xl opacity-30 sm:size-36" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to start?</h2>
            <p className="mt-1 opacity-90">Pick your class and open your first chapter. It&apos;s free.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/#classes" className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-ink px-5 font-bold text-brand-cream shadow-[0_3px_0_rgb(0_0_0/0.35)] transition active:translate-y-0.5 dark:bg-brand-cream dark:text-brand-ink">
              Choose your class <ArrowRightIcon className="size-5" />
            </Link>
            <Link href="/register" className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-xl bg-white/40 px-5 font-bold backdrop-blur-sm hover:bg-white/55 dark:bg-white/10 dark:hover:bg-white/15">
              Join free
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact (email only: never a phone number, WhatsApp or address)
// ---------------------------------------------------------------------------

async function ContactPage({ page }: { page: SitePage | null }) {
  const [{ contact, social }, faq] = await Promise.all([getSiteSettings(), getFaq()]);
  const [local, domain] = [contact.email.split("@")[0], contact.email.split("@").slice(1).join("@")];
  const hasSocial = Object.values(social).some(Boolean);
  return (
    <>
      <Hero slug="contact" title="We'd love to hear from you" />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="form-title" className="card-3d rounded-3xl p-5 sm:p-8">
          <h2 id="form-title" className="font-heading text-2xl font-extrabold tracking-tight">
            Send us a message
          </h2>
          <p className="mb-6 mt-1 text-muted-foreground">We read every message and reply by email.</p>
          <ContactForm email={contact.email} />
        </section>

        <aside className="grid gap-4">
          <a href={`mailto:${contact.email}`} className="card-3d lift flex items-center gap-4 rounded-2xl p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-amber-light to-brand-amber text-brand-ink" aria-hidden="true">
              <MailIcon className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-muted-foreground">Or email us directly</span>
              {/* Break only after the @ on narrow phones. */}
              <span className="block font-heading text-base font-bold text-brand-amber-text [overflow-wrap:anywhere]">
                {local}@<wbr />
                {domain}
              </span>
            </span>
          </a>

          <div className="card-3d rounded-2xl p-5">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
              <MessageCircleQuestionIcon className="size-5 text-brand-amber-text" aria-hidden="true" /> Quick help
            </h2>
            <ul className="mt-3 grid gap-3 text-[15px] leading-relaxed">
              <li>
                <span className="font-semibold">A payment or a note?</span>{" "}
                <span className="text-muted-foreground">Add the order ID from My profile → My orders, so we can find it quickly.</span>
              </li>
              <li>
                <span className="font-semibold">A mistake in a chapter?</span>{" "}
                <span className="text-muted-foreground">Tell us the class, subject and chapter.</span>
              </li>
              {faq.length > 0 && (
                <li>
                  <Link href="/faq" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-amber-text hover:underline">
                    <HelpCircleIcon className="size-4" aria-hidden="true" /> Read the common questions first
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {hasSocial && (
            <div className="card-3d rounded-2xl p-5">
              <h2 className="font-heading text-lg font-bold">Follow us</h2>
              <SocialIcons links={social} className="mt-3 flex flex-wrap gap-2.5" />
            </div>
          )}

          {page && (
            <div className="card-3d rounded-2xl p-5">
              <div className="rich text-[15px]" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Privacy / Terms / Refund policy
// ---------------------------------------------------------------------------

async function LegalPage({ slug, page }: { slug: StaticSlug; page: SitePage | null }) {
  const { contact } = await getSiteSettings();
  const title = titleOf(slug, page);
  const others = STATIC_LINKS.filter((l) => LEGAL.includes(l.slug as StaticSlug) && l.slug !== slug);
  const body = page ? withHeadingIds(page.bodyHtml) : null;
  const toc = body?.headings.filter((h) => h.level === 3 || !body.headings.some((x) => x.level === 3)) ?? [];

  return (
    <>
      <Hero slug={slug} title={title}>
        <p>{DESCRIPTIONS[slug]}</p>
        {page && <p className="mt-2 text-sm font-semibold opacity-80">Last updated {updated(page.updatedAt)}</p>}
      </Hero>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-4">
          {toc.length > 2 && (
            // Phones: the contents list folds away above the text.
            <details className="card-3d rounded-2xl p-4 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-heading font-bold">
                <ListIcon className="size-5 text-brand-amber-text" aria-hidden="true" /> On this page
              </summary>
              <ol className="mt-2 grid gap-1 border-l-2 border-border pl-3">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="inline-flex min-h-10 items-center text-[15px] text-muted-foreground hover:text-foreground hover:underline">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {body ? (
            <article className="card-3d rounded-3xl p-5 sm:p-10">
              <div className="rich mx-auto max-w-[68ch] text-[16px]" dangerouslySetInnerHTML={{ __html: body.html }} />
            </article>
          ) : (
            <ComingSoon email={contact.email} />
          )}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-24">
          {toc.length > 2 && (
            <nav aria-label="On this page" className="card-3d hidden rounded-2xl p-5 lg:block">
              <p className="font-heading font-bold">On this page</p>
              <ol className="mt-2 grid gap-0.5 border-l-2 border-border pl-3">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="block py-1 text-sm text-muted-foreground hover:text-foreground hover:underline">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <nav aria-label="Other policies" className="card-3d rounded-2xl p-5">
            <p className="font-heading font-bold">Other policies</p>
            <ul className="mt-2 grid gap-1">
              {others.map((l) => {
                const Icon = ICONS[l.slug as StaticSlug];
                return (
                  <li key={l.slug}>
                    <Link href={`/${l.slug}`} className="flex min-h-11 items-center gap-2 font-semibold text-brand-amber-text hover:underline">
                      <Icon className="size-4" aria-hidden="true" /> {l.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Link href="/contact" className="card-3d lift flex items-center gap-3 rounded-2xl p-5">
            <MailIcon className="size-5 shrink-0 text-brand-amber-text" aria-hidden="true" />
            <span>
              <span className="block font-heading font-bold">Questions about this?</span>
              <span className="block text-sm text-muted-foreground">Send us a message</span>
            </span>
            <ArrowRightIcon className="ml-auto size-5 text-brand-amber-text" aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </>
  );
}

// About / Contact / Privacy / Terms / Refund policy. The text is the owner's,
// from Admin → Pages (sanitised on save). Unpublished text shows a friendly
// placeholder (not indexed); the contact form always works.
export async function StaticPage({ slug }: { slug: StaticSlug }) {
  const page = await getPage(slug);
  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }]} />
      {slug === "about" ? <AboutPage page={page} /> : slug === "contact" ? <ContactPage page={page} /> : <LegalPage slug={slug} page={page} />}
    </Container>
  );
}
