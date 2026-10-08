"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// System / Light / Dark, stored per browser. Toggled from the user menu.
export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
