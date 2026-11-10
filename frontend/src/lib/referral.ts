// Refer and Earn (Phase 15). The invite code from /register?ref=CODE is kept in
// this browser for 30 days, so it still counts if the friend looks around the
// site first or signs up with Google. A random device id (no personal data)
// lets the team spot many accounts made on one device.

const REF_KEY = "cc_ref";
const DEVICE_KEY = "cc_device";
const REF_DAYS = 30;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the code just isn't remembered
  }
};

export const cleanCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

export const rememberReferral = (code: string) => {
  const clean = cleanCode(code);
  if (clean) write(REF_KEY, JSON.stringify({ code: clean, at: Date.now() }));
};

export const storedReferral = (): string | null => {
  const raw = read(REF_KEY);
  if (!raw) return null;
  try {
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (Date.now() - at > REF_DAYS * 86_400_000) {
      write(REF_KEY, null);
      return null;
    }
    return code;
  } catch {
    return null;
  }
};

export const forgetReferral = () => write(REF_KEY, null);

export const deviceId = (): string | null => {
  let id = read(DEVICE_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    write(DEVICE_KEY, id);
  }
  return read(DEVICE_KEY);
};

/** What sign-up and Google sign-in send along (nothing when there's no invite). */
export const referralFields = () => {
  const code = storedReferral();
  const device = deviceId();
  return { ...(code ? { referralCode: code } : {}), ...(device ? { deviceId: device } : {}) };
};

export const referralLink = (siteUrl: string, code: string) => `${siteUrl.replace(/\/$/, "")}/register?ref=${code}`;
