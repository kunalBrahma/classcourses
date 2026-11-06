import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { WelcomeForm } from "@/components/auth/welcome-form";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

// "Complete your profile": Google sign-ups and accounts from before 6 Nov 2026
// add their class, district and date of birth here (ProfileGate sends them).
// Also where a student changes their class or district later.
export default function WelcomePage() {
  return (
    <AuthShell title="Your details" subtitle="Tell us your class and district so we can show you the right chapters.">
      <Suspense>
        <WelcomeForm />
      </Suspense>
    </AuthShell>
  );
}
