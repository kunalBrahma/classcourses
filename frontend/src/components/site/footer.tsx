import Link from "next/link";
import { MailIcon } from "lucide-react";
import { getCurrentYear, getPublishedPages, getSiteSettings } from "@/lib/server-api";
import { SocialIcons } from "@/components/site/social-icons";

// Server-rendered, cached. Only published pages are linked (Razorpay checks
// that Contact/Privacy/Terms/Refund exist and are reachable from the site).
export async function SiteFooter() {
  const [{ site, contact, social }, pages, year] = await Promise.all([getSiteSettings(), getPublishedPages(), getCurrentYear()]);

  return (
    <footer className="mt-16 bg-brand-navy text-indigo-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-amber font-heading text-sm font-extrabold text-brand-navy shadow-[0_3px_0_#b45309]">
              CC
            </span>
            <span className="font-heading text-lg font-bold text-white">{site.name}</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-indigo-100/80">
            Free chapter-wise question-answers, MCQs and quizzes for students of Assam — Class 1 to 12, Assamese and English medium.
          </p>
          <p lang="as" className="mt-2 text-sm text-indigo-100/70">
            অসমৰ ছাত্ৰ-ছাত্ৰীৰ বাবে শ্ৰেণী ১–১২ ৰ প্ৰশ্নোত্তৰ।
          </p>
          <SocialIcons links={social} className="mt-5 flex flex-wrap gap-2" />
        </div>

        <nav aria-label="Site">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/" className="hover:text-white hover:underline">Home</Link></li>
            <li><Link href="/#classes" className="hover:text-white hover:underline">Choose your class</Link></li>
            {pages
              .filter((p) => p.slug === "about" || p.slug === "contact")
              .map((p) => (
                <li key={p.slug}><Link href={`/${p.slug}`} className="hover:text-white hover:underline">{p.title}</Link></li>
              ))}
          </ul>
        </nav>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Help &amp; policies</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {pages
              .filter((p) => p.slug !== "about" && p.slug !== "contact")
              .map((p) => (
                <li key={p.slug}><Link href={`/${p.slug}`} className="hover:text-white hover:underline">{p.title}</Link></li>
              ))}
            <li>
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 break-all hover:text-white hover:underline">
                <MailIcon className="size-4 shrink-0" /> {contact.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-indigo-200/70 sm:px-6">
          © {year} {site.name}. Made for the students of Assam.
        </p>
      </div>
    </footer>
  );
}
