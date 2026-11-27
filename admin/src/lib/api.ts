import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Refresh tokens are single-use (rotated on every refresh), so only ONE refresh may
// run at a time: pages fire several calls together, and when the access token has
// expired they all get 401 at once. Each used to refresh with the same token; the
// first rotated it and the rest failed and signed the admin out. Every caller now
// shares one refresh in this tab, and a Web Lock keeps other tabs from racing it.
let refreshing: Promise<string | null> | null = null;

async function doRefresh(usedToken: string): Promise<string | null> {
  // Another tab (or an earlier refresh here) already rotated the token.
  const current = getRefreshToken();
  if (!current) return null;
  if (current !== usedToken) return getAccessToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current }),
    });
  } catch {
    return null; // network blip: keep the tokens
  }

  if (!res.ok) {
    // Only a real refusal signs out; a server hiccup (5xx, 429) keeps the tokens.
    if (res.status === 400 || res.status === 401 || res.status === 403) clearTokens();
    return null;
  }

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}

function refreshAccessToken(): Promise<string | null> {
  const usedToken = getRefreshToken();
  if (!usedToken) return Promise.resolve(null);
  if (refreshing) return refreshing;
  const run = (): Promise<string | null> => doRefresh(usedToken);
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const started: Promise<string | null> = locks ? locks.request("cc-admin-auth-refresh", run).then((r) => r) : run();
  const shared = started.finally(() => {
    refreshing = null;
  });
  refreshing = shared;
  return shared;
}

// The session ended on the server: the Super Admin blocked this team member
// (403 ACCOUNT_BLOCKED, with the message to show), or signed them out (the
// refresh failed and the tokens are gone). Go to sign-in at once instead of
// leaving a page full of errors; the sign-in page shows the reason.
export const SESSION_NOTICE_KEY = "cc-admin-session-notice";
const handleRefusedSession = async (res: Response) => {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/login")) return;
  let notice: string | null = null;
  if (res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { code?: string; error?: string } | null;
    if (body?.code !== "ACCOUNT_BLOCKED" && body?.code !== "ACCOUNT_SUSPENDED") return;
    notice = body.error ?? "Your admin account can't be used right now. Please contact the Super Admin.";
    clearTokens();
  } else if (res.status === 401 && !getRefreshToken()) {
    notice = "You were signed out. Please sign in again.";
  } else return;
  try {
    sessionStorage.setItem(SESSION_NOTICE_KEY, notice);
  } catch {
    /* private mode: the sign-in page still explains when they try */
  }
  // A full load on purpose: drops everything the ended session had in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- plain module, no router here
  window.location.assign("/login");
};

// Thin fetch wrapper: attaches the access token and, on a single 401,
// transparently rotates the refresh token and retries once.
export async function api(path: string, options: RequestInit = {}) {
  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  const sentToken = getAccessToken();
  let res = await doFetch(sentToken);

  if (res.status === 401) {
    // A refresh that finished while this call was in flight already gave us a new token.
    const latest = getAccessToken();
    const newAccessToken = latest && latest !== sentToken ? latest : await refreshAccessToken();
    if (newAccessToken) {
      res = await doFetch(newAccessToken);
    }
  }
  await handleRefusedSession(res);

  return res;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    // Zod field errors from the backend's validation handler, if any
    public readonly details?: Record<string, string[]>
  ) {
    super(message);
  }
}

// JSON helper over api(): parses the body and throws ApiError on non-2xx, with
// the backend's message ("error") and per-field validation details.
export async function apiJson<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = options;
  let res: Response;
  try {
    res = await api(path, json === undefined ? init : { ...init, body: JSON.stringify(json) });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details as Record<string, string[]> | undefined;
    const fieldText = details
      ? Object.entries(details)
          .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`)
          .join(" · ")
      : null;
    throw new ApiError(res.status, fieldText ? `${data.error ?? "Validation failed"} — ${fieldText}` : data.error ?? `Request failed (${res.status})`, details);
  }
  return data as T;
}

// Revokes the refresh token on the server, then forgets both tokens locally.
export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  clearTokens();
}
