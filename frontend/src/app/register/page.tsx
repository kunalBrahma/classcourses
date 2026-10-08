import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { getPublishedPages } from "@/lib/server-api";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Join free", robots: { index: false } };

export default async function RegisterPage() {
  const pages = await getPublishedPages();
  const has = (slug: string) => pages.some((p) => p.slug === slug);
  return (
    <AuthShell
      title="Join Class Course"
      subtitle="Free for every student. Save your progress, take quizzes and earn coins."
      footer={
        <>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <Suspense>
        <RegisterForm termsPublished={has("terms")} privacyPublished={has("privacy")} />
      </Suspense>
    </AuthShell>
  );
}
