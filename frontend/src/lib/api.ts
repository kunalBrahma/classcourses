import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// The admin suspended or blocked the account (client requirements of 6 Nov
// 2026): sign out here and show the server's reason on the sign-in page.
export const ACCOUNT_NOTICE_KEY = "cc-account-notice";
const ACCOUNT_CODES = new Set(["ACCOUNT_SUSPENDED", "ACCOUNT_BLOCKED"]);
const handleAccountRefusal = async (res: Response) => {
  if (res.status !== 403 || typeof window === "undefined") return;
  const body = (await res.clone().json().catch(() => null)) as { code?: string; error?: string } | null;
  if (!body?.code || !ACCOUNT_CODES.has(body.code)) return;
  clearTokens();
  try {
    sessionStorage.setItem(ACCOUNT_NOTICE_KEY, body.error ?? "This account can't be used right now.");
  } catch {
    /* private mode: the sign-in page still explains on the next try */
  }
  // A full load on purpose: drops everything the signed-out session had in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- plain module, no router here
  if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
};

// Refresh tokens are single-use (rotated on every refresh), so only ONE refresh may
// run at a time. A page often fires several calls together (me, quiz, notes,
// notifications); when the access token has expired they all get 401 at once.
// Before this, each one refreshed with the same token: the first rotated it, the
// others got an error and signed the student out. Now every caller shares one
// refresh in this tab, and a Web Lock keeps other tabs from racing it.
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
    return null; // offline / network blip: keep the tokens, the student stays signed in
  }

  if (!res.ok) {
    await handleAccountRefusal(res);
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
  const started: Promise<string | null> = locks ? locks.request("cc-auth-refresh", run).then((r) => r) : run();
  const shared = started.finally(() => {
    refreshing = null;
  });
  refreshing = shared;
  return shared;
}

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
  await handleAccountRefusal(res);

  return res;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    // The backend's machine-readable reason, when it sends one (e.g. "EMAIL_NOT_VERIFIED").
    public readonly code?: string
  ) {
    super(message);
  }
}

// JSON helper: parses the body, throws ApiError with the backend's message on non-2xx.
export async function apiJson<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = options;
  let res: Response;
  try {
    res = await api(path, json === undefined ? init : { ...init, body: JSON.stringify(json) });
  } catch {
    throw new ApiError(0, "Can't reach Class Course right now. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Something went wrong (${res.status})`, data.code);
  return data as T;
}

// Public (no-login) JSON request.
export async function publicJson<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: { "Content-Type": "application/json", ...rest.headers },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });
  } catch {
    throw new ApiError(0, "Can't reach Class Course right now. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Something went wrong (${res.status})`, data.code);
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
