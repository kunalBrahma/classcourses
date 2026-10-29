"use client";

import * as React from "react";
import Link from "next/link";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV } from "@/components/admin/nav";
import { LogoFull, LogoMark } from "@/components/admin/logo-mark";

// shadcn sidebar-07 (collapses to an icon rail), restyled with the Class Course
// brand: dark-brown surface (the site footer's colour), amber active state and
// the site's "C" logo mark.
function BrandHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip="Class Course Admin" className="hover:bg-sidebar-accent/60">
          <Link href="/dashboard" aria-label="Class Course admin dashboard">
            {/* Collapsed rail: just the square mark. Open: the full logo. */}
            <LogoMark className="hidden size-8 group-data-[collapsible=icon]:block" />
            <span className="grid flex-1 gap-0.5 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <LogoFull className="h-6" />
              <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/70">Admin panel</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-3">
        <BrandHeader />
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <NavMain key={group.label} label={group.label} sections={group.sections} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
