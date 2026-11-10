import { Badge } from "@/components/ui/badge";
import { BlogPostRow, isScheduled, shortDate } from "@/lib/engagement";

export function StatusBadge({ post }: { post: Pick<BlogPostRow, "status" | "publishedAt"> }) {
  if (post.status === "DRAFT") return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
  if (isScheduled(post)) return <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Scheduled · {shortDate(post.publishedAt!)}</Badge>;
  return <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Published</Badge>;
}
