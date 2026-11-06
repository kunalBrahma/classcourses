import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import { env } from "../src/config/env";
import { api, createUserAndLogin, signupProfile } from "./helpers";

// Real signature checks: only Google's public key list is swapped for our test key,
// so the library still verifies signature, issuer, audience and expiry itself.
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-key";
const CLIENT_ID = "test-client.apps.googleusercontent.com";

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

const token = (claims: Record<string, unknown> = {}, key: crypto.KeyObject = privateKey) => {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-1",
    email: "riya@example.com",
    email_verified: true,
    name: "Riya Das",
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const signed = `${b64({ alg: "RS256", kid: KID, typ: "JWT" })}.${b64(body)}`;
  return `${signed}.${crypto.sign("RSA-SHA256", Buffer.from(signed), key).toString("base64url")}`;
};

const google = (credential: string) => api().post("/api/auth/google").send({ credential });

const originalClientId = env.GOOGLE_CLIENT_ID;

beforeAll(() => {
  (env as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID = CLIENT_ID;
  vi.spyOn(OAuth2Client.prototype, "getFederatedSignonCertsAsync").mockResolvedValue({
    certs: { [KID]: publicKey.export({ type: "spki", format: "pem" }).toString() },
    format: "PEM",
  } as never);
});

afterAll(() => {
  (env as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID = originalClientId;
  vi.restoreAllMocks();
});

describe("sign in with Google", () => {
  it("creates a verified student with no password and signs them in", async () => {
    const res = await google(token());
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: "riya@example.com", name: "Riya Das", role: "STUDENT" });
    expect(res.body.user.password).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "riya@example.com" } });
    expect(user.emailVerified).toBe(true);
    expect(user.password).toBeNull();
    expect(user.googleId).toBe("google-sub-1");

    const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("signs the same person in again, even if their Google email changed", async () => {
    const res = await google(token({ email: "riya.new@example.com" }));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("riya@example.com");
    expect(await prisma.user.count({ where: { googleId: "google-sub-1" } })).toBe(1);
  });

  it("a Google-only account can't log in with a password", async () => {
    const res = await api().post("/api/auth/login").send({ email: "riya@example.com", password: "anything-at-all" });
    expect(res.status).toBe(401);
  });

  it("links a verified email account and keeps its password, whatever the case", async () => {
    const student = await createUserAndLogin("STUDENT");
    const before = await prisma.user.findUniqueOrThrow({ where: { email: student.email } });

    const res = await google(token({ sub: "google-sub-2", email: student.email.toUpperCase() }));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(before.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.googleId).toBe("google-sub-2");
    expect(after.password).toBe(before.password);
  });

  it("takes over an unverified sign-up: the old password stops working", async () => {
    // Someone signs up with another person's address and never verifies it.
    const signup = await api().post("/api/auth/register").send({ email: "victim@example.com", password: "attacker-password", name: "Attacker", phone: "9876543210", ...(await signupProfile()) });
    expect(signup.status).toBe(201);

    const res = await google(token({ sub: "google-sub-3", email: "victim@example.com", name: "Real Owner" }));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Real Owner");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "victim@example.com" } });
    expect(user).toMatchObject({ emailVerified: true, password: null, phone: null, googleId: "google-sub-3" });
    expect((await api().post("/api/auth/login").send({ email: "victim@example.com", password: "attacker-password" })).status).toBe(401);
  });

  it("refuses admin accounts, by email and once linked", async () => {
    const admin = await createUserAndLogin("ADMIN");
    expect((await google(token({ sub: "google-sub-4", email: admin.email }))).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).googleId).toBeNull();

    await prisma.user.update({ where: { email: "riya@example.com" }, data: { role: "ADMIN" } });
    expect((await google(token())).status).toBe(403);
    await prisma.user.update({ where: { email: "riya@example.com" }, data: { role: "STUDENT" } });
  });

  it("rejects tokens it shouldn't trust", async () => {
    const now = Math.floor(Date.now() / 1000);
    const bad = {
      "another app's token": token({ aud: "other-app.apps.googleusercontent.com" }),
      "wrong signature": token({}, stranger.privateKey),
      expired: token({ iat: now - 7200, exp: now - 3600 }),
      "wrong issuer": token({ iss: "https://evil.example.com" }),
      "email not verified": token({ sub: "google-sub-5", email: "unverified@example.com", email_verified: false }),
      garbage: "not-a-token",
    };
    for (const [name, credential] of Object.entries(bad)) {
      expect((await google(credential)).status, name).toBe(401);
    }
    expect(await prisma.user.count({ where: { email: "unverified@example.com" } })).toBe(0);
    expect((await api().post("/api/auth/google").send({})).status).toBe(400);
  });

  it("says so when Google sign-in isn't set up", async () => {
    (env as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID = undefined;
    expect((await google(token())).status).toBe(503);
    (env as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID = CLIENT_ID;
  });
});
