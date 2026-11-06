import http from "node:http";
import request from "supertest";
import { Role } from "@prisma/client";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

// One server per test file, bound to 127.0.0.1 and started by tests/setup.ts
// before any test runs. `request(app)` (or a server that isn't listening yet)
// makes supertest start a server on all addresses (::) for each request and
// close it afterwards. A new port each time can match a port another local
// process listens on at 127.0.0.1, and that process then gets the request:
// random empty 400/404s ("Client sent an HTTP request to an HTTPS server").
let server: http.Server | null = null;
export const startTestServer = () =>
  new Promise<void>((resolve, reject) => {
    if (server?.listening) return resolve();
    server = http.createServer(app);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
    server.unref(); // never keeps the test run alive
  });
export const stopTestServer = () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
export const api = () => {
  if (!server?.listening) throw new Error("The test server isn't running (tests/setup.ts starts it)");
  return request(server);
};

let counter = 0;

// Valid class, district and date of birth for sign-up (made if missing).
export const signupProfile = async () => {
  const classLevel =
    (await prisma.classLevel.findFirst({ where: { isActive: true }, orderBy: { order: "asc" } })) ??
    (await prisma.classLevel.create({ data: { name: "Test Class", slug: "test-class" } }));
  const district = await prisma.district.upsert({ where: { name: "Test District" }, update: { isActive: true }, create: { name: "Test District" } });
  return { classLevelId: classLevel.id, districtId: district.id, dateOfBirth: "2012-05-14" };
};

// Creates a user directly in the DB and logs in through the real API.
export const createUserAndLogin = async (role: Role = "STUDENT") => {
  counter += 1;
  const email = `${role.toLowerCase()}${counter}-${Date.now()}@test.local`;
  const password = "Password123!";
  await prisma.user.create({
    data: { email, password: await hashPassword(password), name: `${role} ${counter}`, role },
  });
  const res = await api().post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, token: res.body.accessToken as string, auth: `Bearer ${res.body.accessToken}` };
};

export const hasR2Env = Boolean(
  process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME
);

// Id of a seeded "Class N" (slug class-N).
export const classIdOf = async (n: number) => (await prisma.classLevel.findUniqueOrThrow({ where: { slug: `class-${n}` } })).id;
