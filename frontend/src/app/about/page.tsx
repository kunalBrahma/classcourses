import { StaticPage, staticPageMetadata } from "@/components/pages/static-page";

export const generateMetadata = () => staticPageMetadata("about");

export default function Page() {
  return <StaticPage slug="about" />;
}
