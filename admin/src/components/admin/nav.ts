import { GiftIcon, BellIcon, HeartIcon, MegaphoneIcon, PenLineIcon, FileTextIcon, HistoryIcon, InboxIcon, ShieldCheckIcon, UserCogIcon, LayoutDashboardIcon, NewspaperIcon, TimerIcon, LibraryBigIcon, ReceiptIndianRupeeIcon, Settings2Icon, UsersIcon, type LucideIcon } from "lucide-react";

// Single source for the sidebar and the header breadcrumbs.
// Each development phase adds its section here (task.md) — only link pages that exist.
// Who may open it: a helper admin's section, "super" (the Founder only), or
// nothing (every admin). Must match backend/src/config/adminAccess.ts.
export type Access = "content" | "quiz_reports" | "notes_orders" | "users" | "support" | "super";

export interface NavLeaf {
  title: string;
  url: string;
  access?: Access;
}

export interface NavSection {
  title: string;
  icon: LucideIcon;
  // A section is either a direct link (url) or a collapsible group (items).
  url?: string;
  items?: NavLeaf[];
  access?: Access;
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
          { title: "Subjects & chapters", url: "/catalog/subjects", access: "content" },
          { title: "Mediums", url: "/catalog/mediums", access: "content" },
          { title: "Classes", url: "/catalog/classes", access: "content" },
          { title: "Districts", url: "/catalog/districts", access: "content" },
        ],
      },
      {
        title: "Quizzes",
        icon: TimerIcon,
        items: [
          { title: "Quiz builder", url: "/quizzes/manage", access: "content" },
          { title: "Attempts", url: "/quizzes/attempts", access: "quiz_reports" },
          { title: "Stats", url: "/quizzes/stats", access: "quiz_reports" },
        ],
      },
      {
        title: "Pages, FAQ & News",
        icon: NewspaperIcon,
        items: [
          { title: "Site pages", url: "/pages", access: "content" },
          { title: "FAQ", url: "/faq", access: "content" },
          { title: "News links", url: "/news", access: "content" },
          { title: "Home banners", url: "/banners", access: "content" },
        ],
      },
      {
        title: "Blog",
        icon: PenLineIcon,
        items: [
          { title: "Posts", url: "/blog/posts", access: "content" },
          { title: "Categories", url: "/blog/categories", access: "content" },
        ],
      },
      { title: "Announcements", icon: MegaphoneIcon, url: "/announcements", access: "content" },
    ],
  },
  {
    label: "Sales",
    sections: [
      { title: "Premium notes", icon: FileTextIcon, url: "/notes", access: "notes_orders" },
      { title: "Orders", icon: ReceiptIndianRupeeIcon, url: "/orders", access: "notes_orders" },
    ],
  },
  {
    label: "People",
    sections: [
      { title: "Users", icon: UsersIcon, url: "/users", access: "users" },
      { title: "Messages", icon: InboxIcon, url: "/messages", access: "support" },
      { title: "Notices", icon: BellIcon, url: "/notices", access: "users" },
      { title: "Likes & saves", icon: HeartIcon, url: "/likes-saves", access: "users" },
      { title: "Refer and Earn", icon: GiftIcon, url: "/referrals", access: "super" },
      { title: "Team", icon: UserCogIcon, url: "/team", access: "super" },
      { title: "Activity log", icon: HistoryIcon, url: "/activity", access: "super" },
      { title: "Sign-in log", icon: ShieldCheckIcon, url: "/security/sign-ins", access: "super" },
    ],
  },
  {
    label: "Configuration",
    sections: [
      {
        title: "Settings",
        icon: Settings2Icon,
        items: [
          { title: "General", url: "/settings/general", access: "super" },
          { title: "Quiz & coins", url: "/settings/quiz", access: "super" },
          { title: "Storage (R2)", url: "/settings/storage", access: "super" },
          { title: "Email (SMTP)", url: "/settings/email", access: "super" },
          { title: "Payments", url: "/settings/payments", access: "super" },
          { title: "Security & limits", url: "/settings/security", access: "super" },
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

// ---- Helper admins see only their sections ----

export interface AccessHolder {
  adminLevel?: "SUPER" | "HELPER";
  adminPermissions?: string[];
}

export const canAccess = (user: AccessHolder, access: Access | undefined) =>
  !access || user.adminLevel !== "HELPER" || (access !== "super" && (user.adminPermissions ?? []).includes(access));

/** The menu as this admin may use it (empty groups and sections dropped). */
export const navFor = (user: AccessHolder): NavGroup[] =>
  NAV.map((group) => ({
    ...group,
    sections: group.sections
      .map((section) => (section.items ? { ...section, items: section.items.filter((i) => canAccess(user, i.access ?? section.access)) } : section))
      .filter((section) => (section.items ? section.items.length > 0 : canAccess(user, section.access))),
  })).filter((group) => group.sections.length > 0);

/** What the page at this path needs (undefined = every admin). */
export const accessForPath = (pathname: string): Access | undefined => {
  for (const group of NAV) {
    for (const section of group.sections) {
      if (section.url && isActivePath(pathname, section.url)) return section.access;
      const leaf = section.items?.find((item) => isActivePath(pathname, item.url));
      if (leaf) return leaf.access ?? section.access;
    }
  }
  return undefined;
};
