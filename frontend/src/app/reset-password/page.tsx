import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

// Linked from the password-reset email: /reset-password?token=…
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you'll remember — at least 8 characters."
      footer={
        <>
          Back to <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
