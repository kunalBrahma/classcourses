import { StaticPage, staticPageMetadata } from "@/components/pages/static-page";

export const generateMetadata = () => staticPageMetadata("privacy");

export default function Page() {
  return <StaticPage slug="privacy" />;
}
