import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to take quizzes, earn coins and get your notes."
      footer={
        <>
          New to Class Course? <AuthLink href="/register">Join free</AuthLink>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
