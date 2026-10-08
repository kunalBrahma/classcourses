import { describe, expect, it } from "vitest";
import { api, createUserAndLogin } from "./helpers";

describe("auth & roles", () => {
  it("health check", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
  });

  it("registers a new user as STUDENT and returns the role on login and /me", async () => {
    const email = `new-${Date.now()}@test.local`;
    const reg = await api().post("/api/auth/register").send({ email, password: "Password123!", name: "New" });
    expect(reg.status).toBe(201);

    const login = await api().post("/api/auth/login").send({ email, password: "Password123!" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("STUDENT");

    const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.body.user.role).toBe("STUDENT");
  });

  it("admin routes: 401 without a token, 403 for a student, 200 for an admin", async () => {
    expect((await api().get("/api/admin/settings")).status).toBe(401);

    const student = await createUserAndLogin("STUDENT");
    const denied = await api().get("/api/admin/settings").set("Authorization", student.auth);
    expect(denied.status).toBe(403);

    const admin = await createUserAndLogin("ADMIN");
    const ok = await api().get("/api/admin/settings").set("Authorization", admin.auth);
    expect(ok.status).toBe(200);
  });
});
