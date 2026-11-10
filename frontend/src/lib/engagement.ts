import { apiJson } from "@/lib/api";

// Phase 14 (client requirements of 6 Nov 2026): Like / Save / Share, Saved,
// notifications. Shapes match backend/src/services/{reaction,notification}.service.ts.

export type ReactionTarget = { chapterId: string } | { blogPostId: string };
export interface ReactionState {
  likes: number;
  liked: boolean;
  saved: boolean;
}

const query = (t: ReactionTarget) => ("chapterId" in t ? `chapterId=${t.chapterId}` : `blogPostId=${t.blogPostId}`);
export const getReactions = (t: ReactionTarget) => apiJson<ReactionState>(`/api/reactions?${query(t)}`);
export const setReaction = (kind: "like" | "save", t: ReactionTarget, on: boolean) => apiJson<ReactionState>(`/api/reactions/${kind}`, { method: "PUT", json: { ...t, on } });

export interface SavedItem {
  id: string;
  type: "CHAPTER" | "BLOG_POST";
  savedAt: string;
  title: string;
  chapterNumber: number | null;
  context: string;
  contextNative: string | null;
  href: string;
  available: boolean;
}

export interface Notification {
  id: string;
  kind: "NOTICE" | "WARNING" | "ACCOUNT";
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  toEveryone: boolean;
  read: boolean;
}

// The bell's count reloads when the inbox is read.
export const NOTIFICATIONS_EVENT = "cc-notifications";
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
