"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminUser, SessionProvider } from "@/components/admin/session";
import { ConfirmProvider } from "@/components/admin/confirm";
import { breadcrumbFor } from "@/components/admin/nav";
import { api } from "@/lib/api";
import { clearTokens, getAccessToken } from "@/lib/auth";
import { LogoMark } from "@/components/admin/logo-mark";

// Guards every page in the (panel) group (must be logged in AND an ADMIN) and
// renders the shadcn sidebar-07 shell around it.
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api("/api/auth/me")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { user: AdminUser }) => {
        if (data.user.role !== "ADMIN") {
          clearTokens();
          router.replace("/login?denied=1");
          return;
        }
        setUser(data.user);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <LogoMark className="size-12 animate-pulse rounded-xl" />
          <span className="text-sm text-muted-foreground">Loading admin panel…</span>
        </div>
      </div>
    );
  }

  const crumb = breadcrumbFor(pathname);

  return (
    <SessionProvider value={user}>
      <ConfirmProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 backdrop-blur-md transition-[width,height] ease-linear supports-[backdrop-filter]:bg-background/70 md:h-16 md:group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 items-center gap-2 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="-ml-1 size-9 md:size-7" />
              <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
              <Breadcrumb className="min-w-0">
                <BreadcrumbList className="flex-nowrap">
                  <BreadcrumbItem className="hidden sm:block">
                    <BreadcrumbLink asChild>
                      <Link href="/dashboard">Admin</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {crumb && (
                    <Fragment>
                      <BreadcrumbSeparator className="hidden sm:block" />
                      {crumb.page ? (
                        <>
                          <BreadcrumbItem className="hidden md:block">{crumb.section}</BreadcrumbItem>
                          <BreadcrumbSeparator className="hidden md:block" />
                          <BreadcrumbItem className="min-w-0">
                            <BreadcrumbPage className="truncate font-medium">{crumb.page}</BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      ) : (
                        <BreadcrumbItem>
                          <BreadcrumbPage className="font-medium">{crumb.section}</BreadcrumbPage>
                        </BreadcrumbItem>
                      )}
                    </Fragment>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          {/* SidebarInset is already the <main> landmark — don't nest a second one. */}
          {/* One standard page width for every admin page: full width, capped only on ultra-wide screens. */}
          <div className="flex flex-1 flex-col px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      </ConfirmProvider>
    </SessionProvider>
  );
}
