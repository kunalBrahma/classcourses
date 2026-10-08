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

// shadcn sidebar-07 (collapses to an icon rail), restyled with the Class Course
// brand: navy surface, amber active state, the "CC" mark from the login page.
function BrandHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip="Class Course Admin" className="hover:bg-sidebar-accent/60">
          <Link href="/dashboard">
            <span className="grid aspect-square size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary font-heading text-xs font-extrabold text-sidebar-primary-foreground shadow-[0_3px_0_#b45309]">
              CC
            </span>
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-heading text-[15px] font-bold text-sidebar-accent-foreground">
                Class Course
              </span>
              <span className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/70">
                Admin panel
              </span>
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
