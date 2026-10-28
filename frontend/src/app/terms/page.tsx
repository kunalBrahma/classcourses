import { StaticPage, staticPageMetadata } from "@/components/pages/static-page";

export const generateMetadata = () => staticPageMetadata("terms");

export default function Page() {
  return <StaticPage slug="terms" />;
}
