import { Logo } from "@/components/site/logo";
import { AccountChip } from "@/components/site/account-menu";
import { LanguageButton, MenuButton, SearchButton } from "@/components/site/lazy-header";
import { getFaq, getMediums, getPublishedPages, getSiteSettings } from "@/lib/server-api";
import { siteLinks } from "@/lib/site-links";
import { NotificationBell } from "@/components/engagement/notification-bell";

// The mock's sticky amber band: logo, coins (or Sign in), search, language, menu.
// Text is ink on amber (the mock's white on amber fails contrast, 2:1).
export async function SiteHeader() {
  const [{ site, referral }, mediums, pages, faq] = await Promise.all([getSiteSettings(), getMediums(), getPublishedPages(), getFaq()]);
  const menuPages = siteLinks(pages, faq.length > 0).map((l) => ({ ...l, updatedAt: "" }));
  return (
    <header className="group/header sticky top-0 z-40 bg-[image:var(--header-bg)] text-brand-ink shadow-[var(--header-shadow)] dark:text-brand-cream">
      {/* Under 360 px (small phones) the spacing tightens, so a 4-digit coin chip still fits. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 px-3 max-[359px]:gap-1 max-[359px]:px-2 sm:gap-2 sm:px-6 lg:px-8">
        {/* The full logo fits from 360 px for guests; signed in, the coin chip needs its room below 440 px, so the square mark stands in. */}
        <Logo
          name={site.name}
          // Signed in, the row also holds the coin chip and four round buttons: the
          // name needs 440 px (room for a 4-digit coin count), or the row overflows
          // and the whole page scrolls sideways on 400–430 px phones (28 Nov 2026).
          nameClassName="max-[359px]:hidden group-has-[[data-account=in]]/header:max-[439px]:hidden"
          markClassName="max-[359px]:block group-has-[[data-account=in]]/header:max-[439px]:block"
        />
        {/* As in the mock: the coin chip sits next to the name. */}
        <AccountChip />
        <div className="ml-auto flex items-center gap-1.5 max-[359px]:gap-1 sm:gap-2">
          <NotificationBell />
          <SearchButton />
          <LanguageButton />
          <MenuButton siteName={site.name} pages={menuPages} mediums={mediums} show={{ videos: true, news: true, refer: referral?.enabled ?? false }} />
        </div>
      </div>
    </header>
  );
}
