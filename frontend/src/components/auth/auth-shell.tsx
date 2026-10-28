import Link from "next/link";

// Two-column auth layout: brand panel (with the "3D" class cards) + form.
// On phones the brand panel becomes a short band above the form card.
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 gap-0 px-0 sm:px-6 sm:py-10 lg:grid-cols-[1fr_1fr] lg:gap-10">
      <section
        className="relative hidden overflow-hidden rounded-3xl bg-brand-brown p-10 text-brand-cream lg:flex lg:flex-col lg:justify-between"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 10%, rgba(245,166,35,.45), transparent 45%), radial-gradient(circle at 10% 95%, rgba(255,190,77,.2), transparent 40%), radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 22px 22px",
        }}
        aria-hidden="true"
      >
        <div className="relative h-44 w-72">
          <div className="absolute inset-0 translate-x-6 translate-y-6 rotate-6 rounded-2xl bg-brand-amber-dark shadow-2xl" />
          <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-3 rounded-2xl bg-brand-amber shadow-2xl" />
          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#fff3dc] to-white p-6 text-brand-ink shadow-2xl">
            <span className="font-heading text-3xl font-bold">Class 1 – 12</span>
            <span className="text-sm text-muted-foreground">Q&amp;A · MCQ · Quiz · Notes</span>
          </div>
        </div>
        <div>
          <p className="font-heading text-4xl font-bold leading-tight">
            Learn every chapter. <span className="text-brand-amber-light">Earn coins.</span>
          </p>
          <p lang="as" className="mt-3 text-lg text-footer-fg">
            প্ৰতিটো অধ্যায় শিকক, কুইজ দিয়ক।
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-center">
        <div className="card-3d mx-auto w-full max-w-md rounded-none border-x-0 px-5 py-8 sm:rounded-3xl sm:border-x sm:px-9 sm:py-10 motion-safe:animate-[cc-rise_500ms_ease-out_both]">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-7 border-t pt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </section>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-brand-amber-text hover:underline">
      {children}
    </Link>
  );
}
