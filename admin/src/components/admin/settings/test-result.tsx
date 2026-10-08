import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TestStep {
  name: string;
  ok: boolean;
  message?: string;
}

export interface TestResultData {
  ok: boolean;
  steps: TestStep[];
  latencyMs: number;
}

// Step-by-step result of a live connection test (storage round trip, SMTP login, ...).
export function TestResult({ result }: { result: TestResultData }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border p-4 text-sm",
        result.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
      )}
    >
      <p className={cn("font-semibold", result.ok ? "text-success" : "text-destructive")}>
        {result.ok ? "Connection OK" : "Connection failed"}
        <span className="ml-2 font-normal text-muted-foreground">{result.latencyMs} ms</span>
      </p>
      <ul className="mt-3 space-y-2">
        {result.steps.map((step) => (
          <li key={step.name} className="flex gap-2">
            {step.ok ? (
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-label="Passed" />
            ) : (
              <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Failed" />
            )}
            <span>
              {step.name}
              {step.message && <span className="mt-0.5 block text-xs text-muted-foreground">{step.message}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
