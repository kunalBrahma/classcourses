import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { getSiteSettings } from "@/lib/server-api";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Mono is only for inline code in rich text: no preload.
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });
// Assamese is written in the Bengali–Assamese script; Noto Sans Bengali covers ৰ and ৱ.
// Not preloaded (it's the biggest file): it swaps in as soon as it arrives, so
// it doesn't hold up the first paint of the page.
const bengali = Noto_Sans_Bengali({ variable: "--font-bengali", subsets: ["bengali"], weight: ["400", "500", "600", "700"], preload: false });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getSiteSettings();
  return {
    metadataBase: new URL(site.frontendUrl),
    title: { default: `${site.name} — Class 1 to 12 question-answers, MCQs & notes`, template: `%s · ${site.name}` },
    description:
      "Free chapter-wise question-answers, MCQs, quizzes and notes for students of Assam, Class 1 to 12, in Assamese and English medium.",
    applicationName: site.name,
    openGraph: { type: "website", siteName: site.name, locale: "en_IN", images: ["/logo.webp"] },
  };
}

export const viewport: Viewport = {
  // The site opens in light mode whatever the device's setting, so the
  // browser bar is amber too.
  themeColor: "#f5a623",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bengali.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <a
            href="#main"
            className="sr-only rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
