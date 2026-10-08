"use client";

import { createContext, useContext } from "react";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "STUDENT" | "ADMIN";
}

const SessionContext = createContext<AdminUser | null>(null);

export const SessionProvider = SessionContext.Provider;

// The logged-in admin. Only usable inside the (panel) layout, which guarantees it.
export function useAdmin(): AdminUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useAdmin() must be used inside the admin panel layout");
  return user;
}
