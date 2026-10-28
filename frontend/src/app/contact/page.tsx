import { StaticPage, staticPageMetadata } from "@/components/pages/static-page";

export const generateMetadata = () => staticPageMetadata("contact");

export default function Page() {
  return <StaticPage slug="contact" />;
}
