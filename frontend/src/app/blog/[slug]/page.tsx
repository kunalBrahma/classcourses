import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogCard, postDate } from "@/components/blog/blog-card";
import { ReactionBar } from "@/components/engagement/reaction-bar";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { CatalogSkeleton } from "@/components/catalog/page-skeleton";
import { Container } from "@/components/site/container";
import { NONE } from "@/lib/catalog-params";
import { getBlogPost, getBlogSlugs, getSiteSettings } from "@/lib/server-api";

export async function generateStaticParams() {
  const slugs = await getBlogSlugs();
  return slugs.length ? slugs.slice(0, 50).map((p) => ({ slug: p.slug })) : [{ slug: NONE }];
}

type Props = PageProps<"/blog/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBlogPost(slug);
  if (!data) return {};
  const { post } = data;
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.excerpt,
      publishedTime: post.publishedAt,
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl, width: post.coverWidth ?? undefined, height: post.coverHeight ?? undefined, alt: post.coverAlt }] } : {}),
    },
  };
}

async function PostContent({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const [data, { site }] = await Promise.all([getBlogPost(slug), getSiteSettings()]);
  if (!data) notFound();
  const { post, related } = data;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: `${site.frontendUrl.replace(/\/$/, "")}/blog/${post.slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }]} />
      <article className="mx-auto max-w-3xl">
        <header className="mb-4">
          {post.category && <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text">{post.category.name}</p>}
          <h1 className="font-heading text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time> · {post.readMinutes} min read
          </p>
        </header>
        <ReactionBar target={{ blogPostId: post.id }} title={post.title} className="mb-5" />
        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- admin upload, shown whole at its stored size
          <img
            src={post.coverImageUrl}
            alt={post.coverAlt}
            width={post.coverWidth ?? undefined}
            height={post.coverHeight ?? undefined}
            className="mb-6 h-auto w-full rounded-2xl"
          />
        )}
        {/* Sanitised by the backend on save (sanitizeHtml.ts allowlist). */}
        <div className="rich text-[17px] leading-relaxed" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      </article>
      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-14">
          <h2 id="related" className="mb-4 font-heading text-2xl font-extrabold">Read next</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <li key={p.id}>
                <BlogCard post={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function BlogPostPage({ params }: Props) {
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<CatalogSkeleton />}>
        <PostContent params={params} />
      </Suspense>
    </Container>
  );
}
