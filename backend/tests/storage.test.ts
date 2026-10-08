import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { api, createUserAndLogin, hasR2Env } from "./helpers";

let auth: string;

beforeAll(async () => {
  auth = (await createUserAndLogin("ADMIN")).auth;
});

describe("storage settings", () => {
  it("never returns the secret", async () => {
    const res = await api().get("/api/admin/settings/storage").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.storage).toHaveProperty("privateBucket");
    expect(res.body.storage).not.toHaveProperty("secretAccessKey");
    if (hasR2Env) {
      expect(res.body.storage.source).toBe("env");
      expect(JSON.stringify(res.body)).not.toContain(process.env.R2_SECRET_ACCESS_KEY);
      expect(res.body.storage.secretAccessKeyMasked).toMatch(/^•+/);
    } else {
      expect(res.body.storage.source).toBe("none");
    }
  });

  it("validates the form", async () => {
    const res = await api()
      .put("/api/admin/settings/storage")
      .set("Authorization", auth)
      .send({ endpoint: "not a url", accessKeyId: "x", bucket: "abc" });
    expect(res.status).toBe(400);
  });

  it.skipIf(!hasR2Env)("live: the active (env) config passes the round trip", async () => {
    const res = await api().post("/api/admin/settings/storage/test-active").set("Authorization", auth);
    expect(res.body.result.ok).toBe(true);
  });

  it.skipIf(!hasR2Env)("live: a wrong secret gives a readable 403 message", async () => {
    const res = await api()
      .post("/api/admin/settings/storage/test")
      .set("Authorization", auth)
      .send({
        endpoint: process.env.R2_ENDPOINT,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: "wrong-secret",
        bucket: process.env.R2_BUCKET_NAME,
      });
    expect(res.body.result.ok).toBe(false);
    expect(res.body.result.steps[0].message).toMatch(/Access denied/);
  });

  it.skipIf(!hasR2Env)(
    "live: save with a private bucket; the current admin page (which omits privateBucket) keeps it",
    async () => {
      const form = {
        endpoint: process.env.R2_ENDPOINT,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: "",
        bucket: process.env.R2_BUCKET_NAME,
        publicUrl: process.env.R2_PUBLIC_URL ?? "",
        signedUrlTtlSeconds: 300,
      };
      // Same bucket stands in for the private one — only proves the wiring.
      const saved = await api()
        .put("/api/admin/settings/storage")
        .set("Authorization", auth)
        .send({ ...form, privateBucket: process.env.R2_BUCKET_NAME });
      expect(saved.status).toBe(200);
      expect(saved.body.result.steps.map((s: { name: string }) => s.name)).toContain("Private bucket: Upload");
      expect(saved.body.storage.privateBucket).toBe(process.env.R2_BUCKET_NAME);

      const row = await prisma.setting.findUnique({ where: { key: "storage" } });
      expect(JSON.stringify(row?.value)).not.toContain(process.env.R2_SECRET_ACCESS_KEY);

      const again = await api().put("/api/admin/settings/storage").set("Authorization", auth).send(form);
      expect(again.status).toBe(200);
      expect(again.body.storage.privateBucket).toBe(process.env.R2_BUCKET_NAME);

      const cleared = await api()
        .put("/api/admin/settings/storage")
        .set("Authorization", auth)
        .send({ ...form, privateBucket: "" });
      expect(cleared.body.storage.privateBucket).toBe("");

      const reset = await api().delete("/api/admin/settings/storage").set("Authorization", auth);
      expect(reset.body.storage.source).toBe("env");
    }
  );
});
