import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, AuthLink } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

// Older reset emails linked here (/reset-password?token=…). Since 6 Nov 2026
// a password is reset with a 6-digit code on /forgot-password instead, so
// these links no longer work. The page stays so old links don't 404.
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We now send a 6-digit code instead of a link."
      footer={
        <>
          Back to <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <div className="grid gap-5">
        <p className="rounded-xl bg-accent px-4 py-3 text-[15px] leading-relaxed">
          This reset link no longer works. Ask for a code instead: it arrives by email and works for 5 minutes.
        </p>
        <Link href="/forgot-password" className="press-3d inline-flex h-12 items-center justify-center rounded-xl text-base font-semibold">
          Get a reset code
        </Link>
      </div>
    </AuthShell>
  );
}
