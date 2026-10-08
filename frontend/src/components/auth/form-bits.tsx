import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FormError({ id, message }: { id?: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive motion-safe:animate-[cc-shake_400ms_ease-in-out]">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">
      <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" />
      <div>{children}</div>
    </div>
  );
}

export function SubmitButton({ loading, children, loadingText }: { loading: boolean; children: React.ReactNode; loadingText: string }) {
  return (
    <Button type="submit" disabled={loading} className="press-3d h-12 w-full rounded-xl text-base font-semibold">
      {loading ? (
        <>
          <Loader2Icon className="animate-spin" /> {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
