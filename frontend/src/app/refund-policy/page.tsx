import { StaticPage, staticPageMetadata } from "@/components/pages/static-page";

export const generateMetadata = () => staticPageMetadata("refund-policy");

export default function Page() {
  return <StaticPage slug="refund-policy" />;
}
