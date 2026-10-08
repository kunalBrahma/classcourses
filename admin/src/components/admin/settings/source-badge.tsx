import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SettingSource = "database" | "env" | "default" | "none";

const STYLES: Record<SettingSource, { label: string; dot: string; className: string }> = {
  database: { label: "Saved in admin", dot: "bg-success", className: "border-success/30 bg-success/10 text-success" },
  env: { label: "Using server file", dot: "bg-warning", className: "border-warning/40 bg-warning/10 text-warning" },
  default: { label: "Default values", dot: "bg-muted-foreground", className: "text-muted-foreground" },
  none: { label: "Not configured", dot: "bg-destructive", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

// Where a setting's live value comes from (backend resolution: DB → env → defaults).
export function SourceBadge({ source, className }: { source: SettingSource; className?: string }) {
  const style = STYLES[source];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", style.className, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden="true" />
      {style.label}
    </Badge>
  );
}
