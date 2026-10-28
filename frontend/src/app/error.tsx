"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/site/container";

// Shown when the server can't load a page (e.g. the API is down for a moment).
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Container className="grid flex-1 place-items-center py-16 text-center">
      <div className="card-3d max-w-md rounded-3xl p-8">
        <h1 className="font-heading text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">We couldn&apos;t load this page. Check your internet connection and try again.</p>
        <Button onClick={retry} className="press-3d mt-6 h-12 rounded-xl px-6 text-base font-bold">
          Try again
        </Button>
      </div>
    </Container>
  );
}
