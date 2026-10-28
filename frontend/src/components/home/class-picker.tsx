import { cookies } from "next/headers";
import { ClassTile } from "@/components/kit/class-tile";
import { MediumTabs } from "@/components/home/medium-tabs";
import { catalogHref } from "@/lib/catalog";
import { MEDIUM_COOKIE } from "@/lib/medium";
import { getMediumClasses, getMediums } from "@/lib/server-api";

// The mock's compact grid: 4 across on a phone.
const tiles = "grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-8";

// Reads the remembered medium (a cookie, so it runs per request inside
// <Suspense>); the medium list and class lists themselves are cached.
export async function ClassPicker() {
  const [mediums, jar] = await Promise.all([getMediums(), cookies()]);
  if (mediums.length === 0) {
    return <p className="card-3d p-8 text-center text-muted-foreground">Classes are being set up. Please check back soon.</p>;
  }
  const wanted = jar.get(MEDIUM_COOKIE)?.value;
  const medium = mediums.find((m) => m.slug === wanted) ?? mediums[0];
  const data = await getMediumClasses(medium.slug);

  return (
    <>
      <MediumTabs mediums={mediums} current={medium.slug} />
      {!data || data.classes.length === 0 ? (
        <p className="card-3d p-8 text-center text-muted-foreground">Classes for {medium.name} are being set up. Please check back soon.</p>
      ) : (
        <ul className={tiles}>
          {data.classes.map((c, i) => (
            <li key={c.id}>
              <ClassTile href={catalogHref(medium.slug, c.slug)} name={c.name} nativeName={c.nativeName} index={i} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ClassPickerSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-3 h-10 w-64 max-w-full animate-pulse rounded-full bg-accent" />
      <div className={tiles}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-accent" />
        ))}
      </div>
    </div>
  );
}
