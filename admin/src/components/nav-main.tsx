"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isActivePath, type NavSection } from "@/components/admin/nav";

// Active item: amber marker + lifted background, matching the brand's depth style.
const activeButton =
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold " +
  "data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]";

export function NavMain({ label, sections }: { label: string; sections: NavSection[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  // On phones the sidebar is a sheet: close it after navigating.
  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">
        {label}
      </SidebarGroupLabel>
      <SidebarMenu>
        {sections.map((section) => {
          const Icon = section.icon;

          if (section.url) {
            return (
              <SidebarMenuItem key={section.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={section.title}
                  isActive={isActivePath(pathname, section.url)}
                  className={activeButton}
                >
                  <Link href={section.url} onClick={onNavigate}>
                    <Icon />
                    <span>{section.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          const sectionActive = section.items?.some((item) => isActivePath(pathname, item.url)) ?? false;
          return (
            <Collapsible key={section.title} asChild defaultOpen={sectionActive} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={section.title} isActive={sectionActive} className={activeButton}>
                    <Icon />
                    <span>{section.title}</span>
                    <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub className="border-sidebar-border">
                    {section.items?.map((item) => {
                      const active = isActivePath(pathname, item.url);
                      return (
                        <SidebarMenuSubItem key={item.url}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={active}
                            className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-primary"
                          >
                            <Link href={item.url} onClick={onNavigate} aria-current={active ? "page" : undefined}>
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
