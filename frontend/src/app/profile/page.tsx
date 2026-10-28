import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { Container } from "@/components/site/container";

export const metadata: Metadata = { title: "My profile", robots: { index: false } };

export default function ProfilePage() {
  return (
    <Container className="py-6 sm:py-10">
      <ProfileView />
    </Container>
  );
}
