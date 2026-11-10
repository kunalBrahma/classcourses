import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AskParent } from "@/components/consent/ask-parent";

export const metadata: Metadata = { title: "Ask a parent", robots: { index: false } };

// Students under 18: a parent or guardian must agree before quizzes, coins and
// buying notes (client requirements of 6 Nov 2026).
export default function ParentConsentPage() {
  return (
    <AuthShell title="Ask a parent or guardian" subtitle="Because you are under 18, a parent or guardian needs to agree before you can take quizzes, earn coins or buy notes.">
      <Suspense>
        <AskParent />
      </Suspense>
    </AuthShell>
  );
}
