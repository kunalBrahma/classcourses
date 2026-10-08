const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
// Fired on sign-in/out so every component reading auth state updates at once.
export const AUTH_EVENT = "cc-auth";

export const getAccessToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(ACCESS_TOKEN_KEY);

export const getRefreshToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(REFRESH_TOKEN_KEY);

export const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
};

// For useSyncExternalStore: re-read on our event and on other tabs' storage changes.
export const subscribeAuth = (onChange: () => void) => {
  window.addEventListener(AUTH_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUTH_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};
