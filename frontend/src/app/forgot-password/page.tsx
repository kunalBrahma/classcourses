import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a 6-digit code to choose a new one."
      footer={
        <>
          Remembered it? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      {/* ?email= (from a paused sign-in) fills the box */}
      <Suspense>
        <ForgotForm />
      </Suspense>
    </AuthShell>
  );
}
