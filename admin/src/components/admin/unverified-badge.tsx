import { Badge } from "@/components/ui/badge";

// A student who signed up but hasn't entered the emailed code yet. They can't log in until they do.
export function UnverifiedBadge() {
  return (
    <Badge variant="outline" className="h-5 border-warning/40 bg-warning/10 px-1.5 text-[10px] text-warning" title="Signed up but hasn't entered the email code yet">
      Email not verified
    </Badge>
  );
}
