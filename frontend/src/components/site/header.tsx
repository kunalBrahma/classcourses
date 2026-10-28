import { Logo } from "@/components/site/logo";
import { AccountChip } from "@/components/site/account-menu";
import { MediumButton, MenuButton, SearchButton } from "@/components/site/lazy-header";
import { getFaq, getMediums, getPublishedPages, getSiteSettings } from "@/lib/server-api";
import { siteLinks } from "@/lib/site-links";

// The mock's sticky amber band: logo, coins (or Sign in), search, medium, menu.
// Text is ink on amber (the mock's white on amber fails contrast, 2:1).
export async function SiteHeader() {
  const [{ site }, mediums, pages, faq] = await Promise.all([getSiteSettings(), getMediums(), getPublishedPages(), getFaq()]);
  const menuPages = siteLinks(pages, faq.length > 0).map((l) => ({ ...l, updatedAt: "" }));
  return (
    <header className="group/header sticky top-0 z-40 bg-[image:var(--header-bg)] text-brand-ink shadow-[var(--header-shadow)] dark:text-brand-cream">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 px-3 sm:gap-2 sm:px-6 lg:px-8">
        {/* The name fits from 360 px for guests; the coin chip needs its room below 400 px. */}
        <Logo name={site.name} nameClassName="max-[359px]:hidden group-has-[[data-account=in]]/header:max-[399px]:hidden" />
        {/* As in the mock: the coin chip sits next to the name. */}
        <AccountChip />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <SearchButton />
          <MediumButton mediums={mediums} />
          <MenuButton siteName={site.name} pages={menuPages} show={{ videos: true, news: true }} />
        </div>
      </div>
    </header>
  );
}
