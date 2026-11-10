import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, PenLineIcon } from "lucide-react";
import { BlogCard } from "@/components/blog/blog-card";
import { PageTitle } from "@/components/kit/page-title";
import { Container } from "@/components/site/container";
import { getBlogList } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description: "Study tips, exam news and guides for students of Assam and their parents.",
  alternates: { canonical: "/blog" },
};

const chip = "inline-flex h-11 shrink-0 items-center rounded-[12px] border px-4 text-sm font-semibold transition";
const href = (category: string | null, page = 1) => {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/blog?${s}` : "/blog";
};

async function BlogResults({ searchParams }: { searchParams: PageProps<"/blog">["searchParams"] }) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category : null;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const data = await getBlogList(category, page);

  return (
    <>
      {data.categories.length > 0 && (
        <nav aria-label="Categories" className="scroll-row -mx-4 mb-6 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ name: "All", slug: null as string | null }, ...data.categories].map((c) => {
            const active = c.slug === category;
            return (
              <Link key={c.slug ?? "all"} href={href(c.slug)} aria-current={active ? "page" : undefined} className={cn(chip, active ? "border-transparent bg-[image:var(--header-bg)] text-brand-ink" : "bg-card hover:bg-accent")}>
                {c.name}
              </Link>
            );
          })}
        </nav>
      )}
      {data.posts.length === 0 ? (
        <div className="card-3d grid justify-items-center gap-2 rounded-2xl px-6 py-14 text-center">
          <PenLineIcon className="size-10 text-brand-amber-text" aria-hidden="true" />
          <p className="font-heading text-xl font-bold">{category ? "No posts in this category yet" : "Posts are coming soon"}</p>
          <p className="text-muted-foreground">Check back for study tips and exam news.</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.posts.map((p) => (
            <li key={p.id}>
              <BlogCard post={p} />
            </li>
          ))}
        </ul>
      )}
      {data.totalPages > 1 && (
        <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-3">
          {page > 1 && (
            <Link href={href(category, page - 1)} className={cn(chip, "bg-card hover:bg-accent")}>
              <ChevronLeftIcon className="size-4" aria-hidden="true" /> Newer
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          {page < data.totalPages && (
            <Link href={href(category, page + 1)} className={cn(chip, "bg-card hover:bg-accent")}>
              Older <ChevronRightIcon className="size-4" aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card-3d h-80 animate-pulse rounded-xl" />
      ))}
    </ul>
  );
}

export default function BlogPage({ searchParams }: PageProps<"/blog">) {
  return (
    <Container className="py-6 sm:py-10">
      <PageTitle title="Blog" kicker="Read">
        Study tips, exam news and guides for students and parents.
      </PageTitle>
      <Suspense fallback={<GridSkeleton />}>
        <BlogResults searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}
