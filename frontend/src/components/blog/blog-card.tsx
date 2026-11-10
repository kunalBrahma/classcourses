import Link from "next/link";
import { PenLineIcon } from "lucide-react";
import type { BlogCard as Card } from "@/lib/server-api";

export const postDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// A blog post in a grid: picture (cut to 16:9 here; whole on the post page),
// category, title, two lines of summary, date and reading time.
export function BlogCard({ post }: { post: Card }) {
  return (
    <Link href={`/blog/${post.slug}`} className="card-3d lift group flex h-full flex-col overflow-hidden rounded-xl">
      <span className="relative block aspect-video bg-[image:var(--header-bg)]">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin upload on the public bucket, already resized
          <img src={post.coverImageUrl} alt={post.coverAlt} loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <PenLineIcon className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-brand-ink/50" aria-hidden="true" />
        )}
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-4">
        {post.category && <span className="text-xs font-bold uppercase tracking-wider text-brand-amber-text">{post.category.name}</span>}
        <span className="font-heading text-lg font-bold leading-snug group-hover:underline">{post.title}</span>
        {post.excerpt && <span className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</span>}
        <span className="mt-auto pt-2 text-xs text-muted-foreground">
          {postDate(post.publishedAt)} · {post.readMinutes} min read
        </span>
      </span>
    </Link>
  );
}
