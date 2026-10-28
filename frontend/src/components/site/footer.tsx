import Link from "next/link";
import { MailIcon } from "lucide-react";
import { getCurrentYear, getFaq, getPublishedPages, getSiteSettings } from "@/lib/server-api";
import { siteLinks } from "@/lib/site-links";
import { SocialIcons } from "@/components/site/social-icons";

// The mock's dark-brown footer: social buttons, one row of page links, the
// contact email. Email only: never a phone number or address.
export async function SiteFooter() {
  const [{ site, contact, social }, pages, year, faq] = await Promise.all([getSiteSettings(), getPublishedPages(), getCurrentYear(), getFaq()]);
  const links = siteLinks(pages, faq.length > 0);

  return (
    <footer className="mt-12 bg-footer text-footer-fg">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-7 sm:px-6 lg:px-8">
        <SocialIcons links={social} className="flex flex-wrap gap-2.5" />
        <nav aria-label="Footer" className="mt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
            {links.map((l) => (
              <li key={l.slug}>
                <Link href={`/${l.slug}`} className="inline-flex min-h-11 items-center font-semibold text-footer-link hover:text-white hover:underline">
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <a href={`mailto:${contact.email}`} className="mt-1 inline-flex min-h-11 items-center gap-2 break-all text-[15px] text-footer-muted hover:text-white hover:underline">
          <MailIcon className="size-4 shrink-0" aria-hidden="true" /> {contact.email}
        </a>
        <p className="mt-4 border-t border-white/10 pt-4 text-sm text-footer-muted">
          © {year} {site.name}. Made for the students of Assam.
        </p>
      </div>
    </footer>
  );
}
