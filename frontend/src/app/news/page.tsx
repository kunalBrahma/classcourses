import type { Metadata } from "next";
import { NewsCard } from "@/components/kit/news-card";
import { PageTitle } from "@/components/kit/page-title";
import { Container } from "@/components/site/container";
import { getNews } from "@/lib/server-api";
import { DEFAULT_NEWS } from "@/lib/site-links";

export const metadata: Metadata = {
  title: "Latest news",
  description: "Education news for students of Assam: exams, results, schools and more, from trusted news sites.",
};

export default async function NewsPage() {
  const news = await getNews();
  const items = news.length ? news : DEFAULT_NEWS;
  return (
    <Container className="py-6 sm:py-10">
      <PageTitle title="Latest news" kicker="News">
        Education and exam news from trusted sites. Each card opens the news site in a new tab.
      </PageTitle>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((n) => (
          <li key={n.id} className="flex">
            <NewsCard source={n.source} title={n.title} url={n.url} imageUrl={n.imageUrl} fluid className="w-full" />
          </li>
        ))}
      </ul>
    </Container>
  );
}
