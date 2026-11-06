import Link from "next/link";
import { MailIcon, MapPinIcon, ShieldCheckIcon } from "lucide-react";
import { getCurrentYear, getFaq, getPublishedPages, getSiteSettings } from "@/lib/server-api";
import { siteLinks } from "@/lib/site-links";
import { NoTranslate } from "@/components/site/no-translate";
import { SocialIcons } from "@/components/site/social-icons";
import { Logo } from "@/components/site/logo";

// The mock's dark-brown footer: social buttons, one row of page links (Privacy,
// Terms and Refund always listed), the support email, then who runs the site:
// operator, address and Grievance Officer (client requirements of 6 Nov 2026).
// Never a phone or WhatsApp number.
export async function SiteFooter() {
  const [{ site, contact, social, operator }, pages, year, faq] = await Promise.all([getSiteSettings(), getPublishedPages(), getCurrentYear(), getFaq()]);
  const links = siteLinks(pages, faq.length > 0);

  return (
    <footer className="mt-12 bg-footer text-footer-fg">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-7 sm:px-6 lg:px-8">
        <Logo name={site.name} className="mb-5 w-fit" nameClassName="h-10" />
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
        <address className="mt-4 grid gap-1.5 border-t border-white/10 pt-4 text-sm not-italic leading-relaxed text-footer-muted">
          <p className="font-semibold text-footer-fg">{operator.operatorLine}</p>
          <p className="flex items-start gap-2">
            <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {operator.address}
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              Grievance Officer: {operator.grievanceName}, {operator.grievanceDesignation}
              {/* Own line; on narrow phones it may break only after the @. */}
              <a href={`mailto:${operator.grievanceEmail}`} className="block [overflow-wrap:anywhere] hover:text-white hover:underline">
                {operator.grievanceEmail.split("@")[0]}@<wbr />
                {operator.grievanceEmail.split("@").slice(1).join("@")}
              </a>
            </span>
          </p>
        </address>
        <p className="mt-4 border-t border-white/10 pt-4 text-sm text-footer-muted">
          <NoTranslate>© {year} {site.name}.{" "}</NoTranslate>Made for the students of Assam.
        </p>
      </div>
    </footer>
  );
}
