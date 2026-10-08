import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken as string;
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

  let res = await doFetch(getAccessToken());

  if (res.status === 401) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      res = await doFetch(newAccessToken);
    }
  }

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
