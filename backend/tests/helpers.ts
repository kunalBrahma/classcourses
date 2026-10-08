import request from "supertest";
import { Role } from "@prisma/client";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

export const api = () => request(app);

let counter = 0;

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
