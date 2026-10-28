import type { Metadata } from "next";
import Link from "next/link";
import { MailIcon } from "lucide-react";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { Container } from "@/components/site/container";
import { getPage, getSiteSettings } from "@/lib/server-api";
import { STATIC_LINKS } from "@/lib/site-links";

export type StaticSlug = "about" | "contact" | "privacy" | "terms" | "refund-policy";

const LEGAL: StaticSlug[] = ["privacy", "terms", "refund-policy"];
const DESCRIPTIONS: Record<StaticSlug, string> = {
  about: "What Class Course is and who it's for: chapter-wise study help for students of Assam.",
  contact: "How to reach Class Course. We answer by email.",
  privacy: "How Class Course collects, uses and protects your information.",
  terms: "The rules for using Class Course, its quizzes, coins and notes.",
  "refund-policy": "Refunds and cancellations for premium notes bought on Class Course.",
};

export async function staticPageMetadata(slug: StaticSlug): Promise<Metadata> {
  const page = await getPage(slug);
  if (!page) return { title: STATIC_LINKS.find((l) => l.slug === slug)?.title, robots: { index: false } };
  return { title: page.title, description: DESCRIPTIONS[slug], alternates: { canonical: `/${slug}` } };
}

const updated = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// About / Contact / Privacy / Terms / Refund policy: the owner's text from
// Admin → Pages (sanitised on save). Until it's published the page says
// "Coming soon" (not indexed), so the footer links always lead somewhere.
export async function StaticPage({ slug }: { slug: StaticSlug }) {
  const [page, { contact }] = await Promise.all([getPage(slug), getSiteSettings()]);
  if (!page) {
    const title = STATIC_LINKS.find((l) => l.slug === slug)?.title ?? "Coming soon";
    return (
      <Container className="py-6 sm:py-10">
        <Breadcrumbs items={[{ label: "Home", href: "/" }]} />
        <div className="max-w-3xl">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <div className="card-3d mt-6 rounded-3xl p-6 sm:p-8">
            <p className="font-heading text-xl font-bold text-brand-amber-text">Coming soon</p>
            <p className="mt-2 text-muted-foreground">We&apos;re still writing this page. Please check back soon.</p>
            <p className="mt-4">
              Questions? Email us at{" "}
              <a href={`mailto:${contact.email}`} className="font-semibold text-brand-amber-text underline">
                {contact.email}
              </a>
              .
            </p>
            <Link href="/" className="press-3d mt-6 inline-flex h-12 items-center rounded-xl px-5 font-bold">
              Back to home
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }]} />
      <article className="max-w-3xl">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{page.title}</h1>
        {LEGAL.includes(slug) && <p className="mt-2 text-sm text-muted-foreground">Last updated {updated(page.updatedAt)}</p>}

        {slug === "contact" && (
          // Email only: never a phone number, WhatsApp or address.
          <a
            href={`mailto:${contact.email}`}
            className="card-3d lift mt-6 flex items-center gap-4 rounded-2xl p-5"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[image:var(--header-bg)] text-brand-ink" aria-hidden="true">
              <MailIcon className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-muted-foreground">Email us</span>
              {/* Break only after the @ on narrow phones. */}
              <span className="block font-heading text-base font-bold text-brand-amber-text [overflow-wrap:anywhere] sm:text-lg">
                {contact.email.split("@")[0]}@<wbr />
                {contact.email.split("@").slice(1).join("@")}
              </span>
            </span>
          </a>
        )}

        <div className="card-3d mt-6 rounded-3xl p-5 sm:p-8">
          <div className="rich" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
        </div>
      </article>
    </Container>
  );
}
