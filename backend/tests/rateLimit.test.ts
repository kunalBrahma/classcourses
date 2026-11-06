import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { rateLimitSwitch, resetRateLimits } from "../src/middleware/rateLimiter";
import { api, signupProfile } from "./helpers";

// The limiters are off for the rest of the suite; here they're on, and each
// case starts from empty counters. All requests come from one IP (127.0.0.1),
// like a whole school behind one network.
const PASSWORD = "Password123!";
const makeUser = async (email: string) => prisma.user.create({ data: { email, password: await hashPassword(PASSWORD), name: "RL" } });
const login = (email: string, password = PASSWORD) => api().post("/api/auth/login").send({ email, password });

beforeAll(async () => {
  rateLimitSwitch.enabled = true;
  for (let i = 0; i < 6; i++) await makeUser(`rl${i}@test.local`);
});
beforeEach(async () => {
  resetRateLimits();
  // Failed sign-ins live in the database (loginThrottle.service.ts)
  await prisma.loginThrottle.deleteMany();
});
afterAll(() => {
  rateLimitSwitch.enabled = false;
  resetRateLimits();
});

describe("rate limits", () => {
  it("successful sign-ins never count: a whole class can log in from one network", async () => {
    for (let i = 0; i < 30; i++) expect((await login(`rl${i % 6}@test.local`)).status).toBe(200);
  });

  it("5 wrong passwords pause that account for 15 minutes, not the others", async () => {
    for (let i = 0; i < 4; i++) expect((await login("rl0@test.local", "wrong-password")).status).toBe(401);
    const fifth = await login("rl0@test.local", "wrong-password");
    expect(fifth.status).toBe(429);
    expect(fifth.body).toMatchObject({ code: "LOGIN_LOCKED", retryAfter: 900 });
    const locked = await login("rl0@test.local"); // even the right password waits
    expect(locked.status).toBe(429);
    expect(locked.body.error).toMatch(/paused for 15 minutes/);
    expect((await login("RL0@test.local", "x-wrong")).status).toBe(429); // same account, other casing
    expect((await login("rl1@test.local")).status).toBe(200);
  });

  it("20 failed sign-ins from one network pause further sign-ins from it", async () => {
    for (let u = 1; u <= 5; u++) {
      for (let i = 0; i < 4; i++) {
        const res = await login(`rl${u}@test.local`, "wrong-password");
        expect(res.status).toBe(u === 5 && i === 3 ? 429 : 401);
      }
    }
    const blocked = await login("rl0@test.local");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("LOGIN_LOCKED");
  });

  it("sign-up allows 15 new accounts per hour from one network", async () => {
    const profile = await signupProfile();
    const signUp = (i: number) => api().post("/api/auth/register").send({ email: `new${i}@test.local`, password: PASSWORD, name: "New", phone: "9876543210", ...profile });
    for (let i = 0; i < 15; i++) expect((await signUp(i)).status).toBe(201);
    expect((await signUp(15)).status).toBe(429);
  });

  it("forgot password: 3 emails per address per hour", async () => {
    const forgot = (email: string) => api().post("/api/auth/forgot-password").send({ email });
    for (let i = 0; i < 3; i++) expect((await forgot("rl2@test.local")).status).toBe(200);
    const res = await forgot("rl2@test.local");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/already sent several codes/);
    expect((await forgot("rl3@test.local")).status).toBe(200);
  });

  it("every limit is a setting: changing it applies at once, without a restart", async () => {
    const admin = await prisma.user.create({ data: { email: "rl-admin@test.local", password: await hashPassword(PASSWORD), role: "ADMIN" } });
    const token = (await login(admin.email)).body.accessToken;
    const put = (body: object) => api().put("/api/admin/settings/security").set("Authorization", `Bearer ${token}`).send(body);
    const search = () => api().get("/api/catalog/search?q=ab");
    expect((await put({ searchLimit: 2 })).status).toBe(200);
    expect((await search()).status).toBe(200);
    expect((await search()).status).toBe(200);
    const third = await search();
    expect(third.status).toBe(429);
    expect(third.body.error).toMatch(/Too many searches/);
    // A new window starts the count again
    expect((await put({ searchWindowMinutes: 2 })).status).toBe(200);
    expect((await search()).status).toBe(200);
    // Safe bounds: a sign-in limit below 3 is refused
    expect((await put({ loginAccountMax: 1 })).status).toBe(400);
    await api().delete("/api/admin/settings/security").set("Authorization", `Bearer ${token}`);
  });

  it("the whole API has a per-IP backstop (600 a minute); health checks are outside it", async () => {
    for (let i = 0; i < 600; i++) {
      const res = await api().get("/api/settings/public");
      if (res.status !== 200) throw new Error(`request ${i + 1} got ${res.status} ${JSON.stringify(res.body)}`);
    }
    const res = await api().get("/api/catalog/mediums");
    expect(res.status).toBe(429);
    expect(res.headers["ratelimit-limit"] ?? res.headers["ratelimit"]).toBeDefined();
    expect((await api().get("/health")).status).toBe(200);

    // The student site's server (all page renders share its IP) skips it with
    // the shared key; a wrong key doesn't.
    const key = process.env.INTERNAL_API_KEY!;
    expect((await api().get("/api/catalog/mediums").set("X-Internal-Key", key)).status).toBe(200);
    expect((await api().get("/api/catalog/mediums").set("X-Internal-Key", key.replace(/.$/, "x"))).status).toBe(429);
  });
});
