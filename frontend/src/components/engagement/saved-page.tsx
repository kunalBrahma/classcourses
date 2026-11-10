"use client";

import { useRequireSignIn } from "@/components/site/account-menu";
import { SavedList } from "@/components/engagement/saved-list";

export function SavedPage() {
  const signedIn = useRequireSignIn();
  if (!signedIn) return <div className="card-3d h-24 animate-pulse rounded-2xl" aria-hidden="true" />;
  return <SavedList />;
}
