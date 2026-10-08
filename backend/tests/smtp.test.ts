import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { AddressInfo } from "net";
import prisma from "../src/config/prisma";
import { api, createUserAndLogin } from "./helpers";

// A real SMTP server on localhost, so the whole save → encrypt → send path is exercised.
const received: { to: string[]; raw: string }[] = [];
let server: SMTPServer;
let port: number;
let admin: { email: string; auth: string };

const SMTP_USER = "mailer";
const SMTP_PASS = "local-s3cret-pass";

beforeAll(async () => {
  server = new SMTPServer({
    secure: false,
    disabledCommands: ["STARTTLS"],
    allowInsecureAuth: true,
    onAuth(auth, _session, cb) {
      if (auth.username === SMTP_USER && auth.password === SMTP_PASS) return cb(null, { user: SMTP_USER });
      return cb(new Error("Invalid username or password"));
    },
    onData(stream, session, cb) {
      let raw = "";
      stream.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      stream.on("end", () => {
        received.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
        cb();
      });
    },
    logger: false,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.server.address() as AddressInfo).port;
  admin = await createUserAndLogin("ADMIN");
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const validForm = () => ({
  host: "127.0.0.1",
  port,
  secure: false,
  user: SMTP_USER,
  password: SMTP_PASS,
  fromName: "Class Course",
  fromEmail: "no-reply@classcourse.test",
});

const lastMailTo = (address: string) => [...received].reverse().find((m) => m.to.includes(address));

describe("SMTP settings", () => {
  it("starts unconfigured", async () => {
    const res = await api().get("/api/admin/settings/smtp").set("Authorization", admin.auth);
    expect(res.body.smtp.source).toBe("none");
    expect(res.body.smtp.value).toBeNull();
  });

  it("forgot-password still works while SMTP is unconfigured (dev logs the email)", async () => {
    const student = await createUserAndLogin("STUDENT");
    const res = await api().post("/api/auth/forgot-password").send({ email: student.email });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email: student.email }, include: { resetTokens: true } });
    expect(user?.resetTokens).toHaveLength(1);
  });

  it("refuses to save an unreachable host", async () => {
    const res = await api()
      .put("/api/admin/settings/smtp")
      .set("Authorization", admin.auth)
      .send({ ...validForm(), host: "no-such-host.invalid" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not saved/i);
    const after = await api().get("/api/admin/settings/smtp").set("Authorization", admin.auth);
    expect(after.body.smtp.source).toBe("none");
  });

  it("refuses to save a wrong password with a readable message", async () => {
    const res = await api()
      .put("/api/admin/settings/smtp")
      .set("Authorization", admin.auth)
      .send({ ...validForm(), password: "wrong" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Login rejected/);
  });

  it("validates the form", async () => {
    const res = await api()
      .put("/api/admin/settings/smtp")
      .set("Authorization", admin.auth)
      .send({ ...validForm(), fromEmail: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("saves a working config with the password encrypted and masked", async () => {
    const res = await api().put("/api/admin/settings/smtp").set("Authorization", admin.auth).send(validForm());
    expect(res.status).toBe(200);
    expect(res.body.smtp.source).toBe("database");
    expect(res.body.smtp.value.password).toBeUndefined();
    expect(res.body.smtp.value.hasPassword).toBe(true);
    expect(res.body.smtp.value.passwordMasked).toBe("••••••••pass");
    expect(JSON.stringify(res.body)).not.toContain(SMTP_PASS);

    const row = await prisma.setting.findUnique({ where: { key: "smtp" } });
    const stored = row?.value as { password: string };
    expect(stored.password.startsWith("v1:")).toBe(true);
    expect(JSON.stringify(row?.value)).not.toContain(SMTP_PASS);
  });

  it("a blank password keeps the stored one", async () => {
    const res = await api()
      .put("/api/admin/settings/smtp")
      .set("Authorization", admin.auth)
      .send({ ...validForm(), password: "", fromName: "Class Course Team" });
    expect(res.status).toBe(200);
    expect(res.body.smtp.value.fromName).toBe("Class Course Team");
    expect(res.body.smtp.value.hasPassword).toBe(true);
  });

  it("changing the username requires re-entering the password", async () => {
    const res = await api()
      .put("/api/admin/settings/smtp")
      .set("Authorization", admin.auth)
      .send({ ...validForm(), user: "someone-else", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password for the new user/i);
  });

  it("test endpoint sends a real test email", async () => {
    const res = await api()
      .post("/api/admin/settings/smtp/test")
      .set("Authorization", admin.auth)
      .send({ ...validForm(), to: "inbox@classcourse.test" });
    expect(res.body.result.ok).toBe(true);
    // Subject is MIME-encoded (it contains "—"), so assert on the body; undo quoted-printable soft wraps first.
    const body = lastMailTo("inbox@classcourse.test")?.raw.replace(/=\r?\n/g, "");
    expect(body).toContain("This is a test email from the Class Course admin panel");
  });

  it("test-active defaults the recipient to the logged-in admin", async () => {
    const res = await api().post("/api/admin/settings/smtp/test-active").set("Authorization", admin.auth).send({});
    expect(res.body.result.ok).toBe(true);
    expect(lastMailTo(admin.email)).toBeDefined();
  });

  it("forgot-password delivers a reset link through the saved SMTP", async () => {
    const student = await createUserAndLogin("STUDENT");
    await api().post("/api/auth/forgot-password").send({ email: student.email });
    const mail = lastMailTo(student.email);
    expect(mail).toBeDefined();
    // Quoted-printable may soft-wrap long lines; undo that before matching.
    const body = mail!.raw.replace(/=\r?\n/g, "");
    expect(body).toMatch(/Reset your Class Course password/);
    expect(body).toMatch(/http:\/\/localhost:3100\/reset-password\?token=3D[0-9a-f]{64}|reset-password\?token=[0-9a-f]{64}/);
  });

  it("reset returns to unconfigured", async () => {
    const res = await api().delete("/api/admin/settings/smtp").set("Authorization", admin.auth);
    expect(res.body.smtp.source).toBe("none");
  });
});
