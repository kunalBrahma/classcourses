import Link from "next/link";
import { BookIcon } from "@/components/kit/class-tile";
import { Container } from "@/components/site/container";

export default function NotFound() {
  return (
    <Container className="grid flex-1 place-items-center py-16 text-center">
      <div className="card-3d max-w-md rounded-3xl p-8">
        <BookIcon index={3} className="mx-auto size-16" />
        <h1 className="mt-4 font-heading text-2xl font-extrabold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted-foreground">It may have moved, or the link has a typo. Start again from your class.</p>
        <p lang="as" className="as-text mt-1 text-muted-foreground">
          পৃষ্ঠাটো পোৱা নগ&apos;ল।
        </p>
        <Link href="/#classes" className="press-3d mt-6 inline-flex h-12 items-center justify-center rounded-xl px-6 font-bold">
          Choose your class
        </Link>
      </div>
    </Container>
  );
}
