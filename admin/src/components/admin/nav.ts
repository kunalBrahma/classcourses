import { FileTextIcon, LayoutDashboardIcon, NewspaperIcon, TimerIcon, LibraryBigIcon, ReceiptIndianRupeeIcon, Settings2Icon, UsersIcon, type LucideIcon } from "lucide-react";

// Single source for the sidebar and the header breadcrumbs.
// Each development phase adds its section here (task.md) — only link pages that exist.
export interface NavLeaf {
  title: string;
  url: string;
}

export interface NavSection {
  title: string;
  icon: LucideIcon;
  // A section is either a direct link (url) or a collapsible group (items).
  url?: string;
  items?: NavLeaf[];
}

export interface NavGroup {
  label: string;
  sections: NavSection[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    sections: [{ title: "Dashboard", icon: LayoutDashboardIcon, url: "/dashboard" }],
  },
  {
    label: "Content",
    sections: [
      {
        title: "Catalog",
        icon: LibraryBigIcon,
        items: [
          { title: "Subjects & chapters", url: "/catalog/subjects" },
          { title: "Mediums", url: "/catalog/mediums" },
          { title: "Classes", url: "/catalog/classes" },
        ],
      },
      {
        title: "Quizzes",
        icon: TimerIcon,
        items: [
          { title: "Quiz builder", url: "/quizzes/manage" },
          { title: "Attempts", url: "/quizzes/attempts" },
          { title: "Stats", url: "/quizzes/stats" },
        ],
      },
      {
        title: "Pages & FAQ",
        icon: NewspaperIcon,
        items: [
          { title: "Site pages", url: "/pages" },
          { title: "FAQ", url: "/faq" },
        ],
      },
    ],
  },
  {
    label: "Sales",
    sections: [
      { title: "Premium notes", icon: FileTextIcon, url: "/notes" },
      { title: "Orders", icon: ReceiptIndianRupeeIcon, url: "/orders" },
    ],
  },
  {
    label: "People",
    sections: [
      { title: "Users", icon: UsersIcon, url: "/users" },
    ],
  },
  {
    label: "Configuration",
    sections: [
      {
        title: "Settings",
        icon: Settings2Icon,
        items: [
          { title: "General", url: "/settings/general" },
          { title: "Quiz & coins", url: "/settings/quiz" },
          { title: "Storage (R2)", url: "/settings/storage" },
          { title: "Email (SMTP)", url: "/settings/email" },
          { title: "Payments (Razorpay)", url: "/settings/payments" },
        ],
      },
    ],
  },
];

export const isActivePath = (pathname: string, url: string) => pathname === url || pathname.startsWith(`${url}/`);

// ["Settings", "Storage (R2)"] for /settings/storage — used by the header breadcrumb.
export const breadcrumbFor = (pathname: string): { section: string; page?: string; sectionUrl?: string } | null => {
  for (const group of NAV) {
    for (const section of group.sections) {
      if (section.url && isActivePath(pathname, section.url)) return { section: section.title };
      const leaf = section.items?.find((item) => isActivePath(pathname, item.url));
      if (leaf) return { section: section.title, page: leaf.title, sectionUrl: section.items?.[0]?.url };
    }
  }
  return null;
};
