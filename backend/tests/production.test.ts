import { describe, expect, it } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { envSchema } from "../src/config/env";
import { api } from "./helpers";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "x".repeat(64),
  SETTINGS_ENCRYPTION_KEY: "a".repeat(64),
};
const prod = {
  ...base,
  NODE_ENV: "production",
  CORS_ORIGIN: "https://classcourse.in, https://admin.classcourse.in/",
  FRONTEND_URL: "https://classcourse.in",
  TRUST_PROXY: "1",
};

describe("environment rules", () => {
  it("parses a comma-separated CORS list into exact origins", () => {
    const env = envSchema.parse(prod);
    expect(env.CORS_ORIGIN).toEqual(["https://classcourse.in", "https://admin.classcourse.in"]);
    expect(env.TRUST_PROXY).toBe(1);
  });

  it("rejects CORS entries that aren't bare origins", () => {
    const res = envSchema.safeParse({ ...prod, CORS_ORIGIN: "https://classcourse.in/app" });
    expect(res.success).toBe(false);
  });

  it("refuses development defaults in production", () => {
    const res = envSchema.safeParse({ ...base, NODE_ENV: "production" });
    expect(res.success).toBe(false);
    const errors = res.success ? {} : res.error.flatten().fieldErrors;
    expect(Object.keys(errors).sort()).toEqual(["CORS_ORIGIN", "FRONTEND_URL"]);

    const weakJwt = envSchema.safeParse({ ...prod, JWT_ACCESS_SECRET: "short-but-16-chars" });
    expect(weakJwt.success).toBe(false);
    expect(envSchema.safeParse({ ...prod, RAZORPAY_API_BASE: "http://127.0.0.1:1/v1" }).success).toBe(false);
  });

  it("keeps development permissive", () => {
    const env = envSchema.parse(base);
    expect(env.CORS_ORIGIN).toBe("*");
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("an origin list actually allows each listed site and blocks others", async () => {
    // The bug this guards against: passing the raw "a,b" string to cors().
    const origin = envSchema.parse(prod).CORS_ORIGIN;
    const app = express().use(cors({ origin })).get("/", (_req, res) => res.send("ok"));
    const allowed = await request(app).get("/").set("Origin", "https://admin.classcourse.in");
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://admin.classcourse.in");
    const blocked = await request(app).get("/").set("Origin", "https://evil.example");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("health checks", () => {
  it("/health/ready checks the database", async () => {
    const res = await api().get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "ok" });
  });
});
