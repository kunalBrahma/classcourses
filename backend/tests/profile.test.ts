import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { DISTRICTS } from "../src/content/districts";
import { ageOn, ensureDefaultDistricts, parseDateOfBirth } from "../src/services/profile.service";
import { api, createUserAndLogin } from "./helpers";

// Student profile (client requirements of 6 Nov 2026): class, district and
// date of birth at sign-up, phone optional, and "complete your profile" for
// Google sign-ups and older accounts.

let admin: string;
let classId: string;
let otherClassId: string;
let districtId: string;

const adminApi = {
  get: (path: string) => api().get(path).set("Authorization", admin),
  post: (path: string, body: object) => api().post(path).set("Authorization", admin).send(body),
  patch: (path: string, body: object) => api().patch(path).set("Authorization", admin).send(body),
  put: (path: string, body: object) => api().put(path).set("Authorization", admin).send(body),
  delete: (path: string) => api().delete(path).set("Authorization", admin),
};

const signUp = (email: string, extra: Record<string, unknown> = {}) =>
  api()
    .post("/api/auth/register")
    .send({ email, password: "Password123!", name: "Riya", classLevelId: classId, districtId, dateOfBirth: "2013-08-20", ...extra });

beforeAll(async () => {
  await seedCatalog();
  expect(await ensureDefaultDistricts()).toEqual({ districtsCreated: DISTRICTS.length });
  admin = (await createUserAndLogin("ADMIN")).auth;
  const classes = await prisma.classLevel.findMany({ orderBy: { order: "asc" } });
  classId = classes[6].id; // Class 7
  otherClassId = classes[9].id; // Class 10
  districtId = (await prisma.district.findUniqueOrThrow({ where: { name: "Nagaon" } })).id;
});

describe("date of birth rules", () => {
  it("accepts real past dates and rejects impossible, future or too-young ones", () => {
    expect(parseDateOfBirth("2013-08-20", "2026-11-06").toISOString()).toBe("2013-08-20T00:00:00.000Z");
    expect(() => parseDateOfBirth("2013-02-30", "2026-11-06")).toThrow(/real date/);
    expect(() => parseDateOfBirth("2013-13-01", "2026-11-06")).toThrow(/real date/);
    expect(() => parseDateOfBirth("2026-11-07", "2026-11-06")).toThrow(/future/);
    expect(() => parseDateOfBirth("2024-01-01", "2026-11-06")).toThrow(/year of birth/);
    expect(() => parseDateOfBirth("1890-01-01", "2026-11-06")).toThrow(/year of birth/);
    expect(parseDateOfBirth("2012-02-29", "2026-11-06").toISOString()).toBe("2012-02-29T00:00:00.000Z");
  });

  it("counts age in Indian days: 18 on the birthday, not the day before", () => {
    const dob = parseDateOfBirth("2008-11-06", "2026-11-06");
    expect(ageOn(dob, "2026-11-05")).toBe(17);
    expect(ageOn(dob, "2026-11-06")).toBe(18);
  });
});

describe("default districts", () => {
  it("adds Assam's districts only while the table is empty", async () => {
    expect(await prisma.district.count()).toBe(DISTRICTS.length);
    expect(await ensureDefaultDistricts()).toEqual({ districtsCreated: 0 });
  });

  it("the sign-up form gets active classes and districts, in order", async () => {
    const res = await api().get("/api/auth/profile-options");
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(12);
    expect(res.body.classes[0]).toEqual({ id: expect.any(String), name: "Class 1", nativeName: null });
    expect(res.body.districts.map((d: { name: string }) => d.name)).toEqual(DISTRICTS);
  });
});

describe("sign-up", () => {
  it("needs class, district and date of birth; phone and school are not asked", async () => {
    expect((await signUp("a1@test.local", { classLevelId: undefined })).status).toBe(400);
    expect((await signUp("a2@test.local", { districtId: undefined })).status).toBe(400);
    expect((await signUp("a3@test.local", { dateOfBirth: undefined })).status).toBe(400);
    expect((await signUp("a4@test.local", { dateOfBirth: "20-08-2013" })).status).toBe(400);
    const future = await signUp("a5@test.local", { dateOfBirth: "2099-01-01" });
    expect(future.status).toBe(400);
    expect(future.body.error).toMatch(/future/);
    expect((await signUp("a6@test.local", { classLevelId: "00000000-0000-4000-8000-000000000000" })).body.error).toMatch(/class/);

    const ok = await signUp("riya@test.local");
    expect(ok.status).toBe(201);
    const saved = await prisma.user.findUniqueOrThrow({ where: { email: "riya@test.local" } });
    expect(saved).toMatchObject({ classLevelId: classId, districtId, phone: null });
    expect(saved.dateOfBirth?.toISOString()).toBe("2013-08-20T00:00:00.000Z");
  });

  it("a hidden district can't be chosen", async () => {
    const hidden = await prisma.district.create({ data: { name: "Hidden District", isActive: false } });
    expect((await signUp("a7@test.local", { districtId: hidden.id })).body.error).toMatch(/district/);
    expect((await api().get("/api/auth/profile-options")).body.districts.some((d: { id: string }) => d.id === hidden.id)).toBe(false);
    await prisma.district.delete({ where: { id: hidden.id } });
  });

  it("/me says the profile is complete, with age and under-18", async () => {
    await prisma.user.update({ where: { email: "riya@test.local" }, data: { emailVerified: true } });
    const login = await api().post("/api/auth/login").send({ email: "riya@test.local", password: "Password123!" });
    const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.body.user).toMatchObject({
      profileComplete: true,
      missingProfile: [],
      dateOfBirth: "2013-08-20",
      isMinor: true,
      classLevel: { id: classId, name: "Class 7" },
      district: { id: districtId, name: "Nagaon" },
    });
    expect(me.body.user.age).toBeGreaterThanOrEqual(13);
  });
});

describe("complete your profile (Google sign-ups, older accounts)", () => {
  it("lists what's missing, then fills it in", async () => {
    const student = await createUserAndLogin("STUDENT", { dateOfBirth: null });
    const me = async () => (await api().get("/api/auth/me").set("Authorization", student.auth)).body.user;
    expect(await me()).toMatchObject({ profileComplete: false, missingProfile: ["classLevel", "district", "dateOfBirth"], dateOfBirth: null, isMinor: null });

    const patch = (body: object) => api().patch("/api/users/me/profile").set("Authorization", student.auth).send(body);
    // One field at a time is fine
    expect((await patch({ classLevelId: classId })).body.user).toMatchObject({ profileComplete: false, missingProfile: ["district", "dateOfBirth"] });
    expect((await patch({ districtId: "not-a-uuid" })).status).toBe(400);
    expect((await patch({ dateOfBirth: "2099-01-01" })).status).toBe(400);

    const done = await patch({ districtId, dateOfBirth: "2005-01-15", phone: "98765 43210", name: "Bitu" });
    expect(done.status).toBe(200);
    expect(done.body.user).toMatchObject({ profileComplete: true, isMinor: false, dateOfBirth: "2005-01-15", phone: "9876543210", name: "Bitu" });
    expect(await me()).toMatchObject({ profileComplete: true });

    // Class and district can change later; phone kept unless sent, "" removes it
    expect((await patch({ classLevelId: otherClassId })).body.user).toMatchObject({ classLevel: { id: otherClassId }, phone: "9876543210" });
    expect((await patch({ phone: "" })).body.user.phone).toBeNull();

    // The date of birth decides parental consent: set once, then via the Helpline
    expect((await patch({ dateOfBirth: "2005-01-15" })).status).toBe(200);
    const change = await patch({ dateOfBirth: "2001-01-15" });
    expect(change.status).toBe(400);
    expect(change.body.error).toMatch(/Helpline/);
  });

  it("needs a signed-in student", async () => {
    expect((await api().patch("/api/users/me/profile").send({ classLevelId: classId })).status).toBe(401);
  });
});

describe("admin: districts", () => {
  it("adds, renames, hides, reorders; refuses duplicates and deleting a district in use", async () => {
    const list = await adminApi.get("/api/admin/districts");
    expect(list.status).toBe(200);
    const nagaon = list.body.districts.find((d: { name: string }) => d.name === "Nagaon");
    expect(nagaon.students).toBeGreaterThanOrEqual(2);

    expect((await adminApi.post("/api/admin/districts", { name: "nagaon" })).status).toBe(409);
    const made = await adminApi.post("/api/admin/districts", { name: "Outside Assam", nativeName: "অসমৰ বাহিৰত" });
    expect(made.status).toBe(201);
    expect(made.body.district).toMatchObject({ name: "Outside Assam", nativeName: "অসমৰ বাহিৰত", isActive: true, students: 0, order: DISTRICTS.length });

    expect((await adminApi.patch(`/api/admin/districts/${made.body.district.id}`, { name: "Barpeta" })).status).toBe(409);
    expect((await adminApi.patch(`/api/admin/districts/${made.body.district.id}`, { isActive: false })).body.district.isActive).toBe(false);
    expect((await api().get("/api/auth/profile-options")).body.districts.some((d: { name: string }) => d.name === "Outside Assam")).toBe(false);

    const ids: string[] = (await adminApi.get("/api/admin/districts")).body.districts.map((d: { id: string }) => d.id);
    expect((await adminApi.put("/api/admin/districts/reorder", { ids: ids.slice(1) })).status).toBe(400);
    expect((await adminApi.put("/api/admin/districts/reorder", { ids: [...ids].reverse() })).status).toBe(200);
    expect((await adminApi.get("/api/admin/districts")).body.districts[0].id).toBe(ids[ids.length - 1]);

    const inUse = await adminApi.delete(`/api/admin/districts/${nagaon.id}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error).toMatch(/Hide it instead/);
    expect((await adminApi.delete(`/api/admin/districts/${made.body.district.id}`)).status).toBe(200);
  });

  it("is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/districts").set("Authorization", student.auth)).status).toBe(403);
    expect((await api().post("/api/admin/districts").set("Authorization", student.auth).send({ name: "X District" })).status).toBe(403);
  });
});

describe("admin: users", () => {
  it("shows class, district, date of birth and age; filters by them and by incomplete profiles", async () => {
    const all = (await adminApi.get("/api/admin/users?role=STUDENT")).body;
    const riya = all.users.find((u: { email: string }) => u.email === "riya@test.local");
    expect(riya).toMatchObject({ district: { name: "Nagaon" }, classLevel: { name: "Class 7" }, dateOfBirth: "2013-08-20", isMinor: true, profileComplete: true });

    const byDistrict = (await adminApi.get(`/api/admin/users?districtId=${districtId}`)).body.users;
    expect(byDistrict.every((u: { district: { id: string } }) => u.district.id === districtId)).toBe(true);

    const incomplete = (await adminApi.get("/api/admin/users?role=STUDENT&profile=incomplete")).body.users;
    expect(incomplete.length).toBeGreaterThan(0);
    expect(incomplete.every((u: { profileComplete: boolean }) => !u.profileComplete)).toBe(true);
    const complete = (await adminApi.get("/api/admin/users?profile=complete&search=riya")).body.users;
    expect(complete.map((u: { email: string }) => u.email)).toEqual(["riya@test.local"]);
    expect((await adminApi.get("/api/admin/users?profile=incomplete&search=riya")).body.users).toEqual([]);

    const detail = (await adminApi.get(`/api/admin/users/${riya.id}`)).body.user;
    expect(detail).toMatchObject({ dateOfBirth: "2013-08-20", district: { name: "Nagaon" }, signsInWithGoogle: false });
    expect(detail.googleId).toBeUndefined();
  });
});
