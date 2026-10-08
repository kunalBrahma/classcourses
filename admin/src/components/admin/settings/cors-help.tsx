"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// The browser uploads straight to R2 (presigned PUT), which R2 only allows when
// the bucket's CORS policy lists this admin site's origin.
const corsPolicy = (origin: string) =>
  JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["PUT", "GET", "HEAD"],
        AllowedHeaders: ["content-type"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2
  );

const subscribe = () => () => {};

export function CorsHelp() {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "https://admin.your-domain");
  const policy = corsPolicy(origin);

  return (
    <details className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">Uploads from this panel need a CORS rule on each bucket</summary>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Cloudflare dashboard → R2 → your bucket → <strong className="text-foreground">Settings</strong> → <strong className="text-foreground">CORS policy</strong> → Add / Edit.</li>
        <li>Paste the policy below and save. Do this for the public <em>and</em> the private bucket.</li>
        <li>When the admin moves to its real domain, add that address to <code>AllowedOrigins</code> too.</li>
      </ol>
      <div className="relative mt-3">
        <pre className="overflow-x-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed">{policy}</pre>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-2 top-2 h-7"
          onClick={() => navigator.clipboard.writeText(policy).then(() => toast.success("CORS policy copied"))}
        >
          <CopyIcon /> Copy
        </Button>
      </div>
    </details>
  );
}
