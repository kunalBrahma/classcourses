import { beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import * as mailer from "../src/utils/mailer";
import { api, createUserAndLogin } from "./helpers";

let admin: { auth: string };
let student: { auth: string; email: string };

beforeAll(async () => {
  admin = await createUserAndLogin("ADMIN");
  student = await createUserAndLogin("STUDENT");
});

const send = (body: object, auth?: string) => {
  const req = api().post("/api/content/contact");
  if (auth) req.set("Authorization", auth);
  return req.send({ name: "Riya Das", email: "Riya@Example.com", topic: "Notes and payments", message: "I paid but the note didn't unlock.", ...body });
};
const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 40; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out");
};

describe("contact form", () => {
  it("saves the message, answers at once, then emails the admin in the background", async () => {
    const spy = vi.spyOn(mailer, "sendContactNotificationEmail");
    const res = await send({ phone: "+91 98765 43210" }, student.auth);
    expect(res.status).toBe(201);
    const saved = await prisma.contactMessage.findFirstOrThrow({ where: { name: "Riya Das" } });
    expect(saved).toMatchObject({ email: "riya@example.com", phone: "9876543210", status: "NEW", topic: "Notes and payments" });
    expect(saved.userId).toBe((await prisma.user.findUniqueOrThrow({ where: { email: student.email } })).id);

    // In tests SMTP isn't set up, so the email is logged and noted as sent.
    await waitFor(async () => (await prisma.contactMessage.findUniqueOrThrow({ where: { id: saved.id } })).emailNote === "sent");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ email: "riya@example.com", topic: "Notes and payments" }));
    spy.mockRestore();
  });

  it("a failed notification email doesn't affect the student, and is noted for the admin", async () => {
    const spy = vi.spyOn(mailer, "sendContactNotificationEmail").mockRejectedValueOnce(new Error("SMTP down"));
    const res = await send({ name: "Mail Fail" });
    expect(res.status).toBe(201);
    const saved = await prisma.contactMessage.findFirstOrThrow({ where: { name: "Mail Fail" } });
    await waitFor(async () => (await prisma.contactMessage.findUniqueOrThrow({ where: { id: saved.id } })).emailNote === "SMTP down");
    spy.mockRestore();
  });

  it("validates fields and quietly drops spam-trap submissions", async () => {
    expect((await send({ name: "" })).status).toBe(400);
    expect((await send({ email: "not-an-email" })).status).toBe(400);
    expect((await send({ topic: "Free money" })).status).toBe(400);
    expect((await send({ message: "short" })).status).toBe(400);
    expect((await send({ phone: "12345" })).status).toBe(400);
    expect((await send({ phone: "" })).status).toBe(201);

    const before = await prisma.contactMessage.count();
    expect((await send({ website: "http://spam.example" })).status).toBe(201);
    expect(await prisma.contactMessage.count()).toBe(before);
  });

  it("admin inbox: lists with counts, changes status, archives and deletes; students can't", async () => {
    const list = await api().get("/api/admin/messages").set("Authorization", admin.auth);
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(3);
    expect(list.body.counts.NEW).toBe(list.body.total);
    const id = list.body.messages[0].id;

    const patch = (status: string) => api().patch(`/api/admin/messages/${id}`).set("Authorization", admin.auth).send({ status });
    expect((await patch("REPLIED")).body.message.status).toBe("REPLIED");
    expect((await patch("WRONG")).status).toBe(400);
    await patch("ARCHIVED");
    const inbox = await api().get("/api/admin/messages").set("Authorization", admin.auth);
    expect(inbox.body.messages.map((m: { id: string }) => m.id)).not.toContain(id);
    expect((await api().get("/api/admin/messages?status=ARCHIVED").set("Authorization", admin.auth)).body.total).toBe(1);
    expect((await api().get("/api/admin/messages?search=riya").set("Authorization", admin.auth)).body.total).toBeGreaterThanOrEqual(0);

    const stats = await api().get("/api/admin/stats").set("Authorization", admin.auth);
    expect(stats.body.attention.some((a: { href: string }) => a.href === "/messages")).toBe(true);

    expect((await api().delete(`/api/admin/messages/${id}`).set("Authorization", admin.auth)).status).toBe(200);
    expect((await api().get("/api/admin/messages").set("Authorization", student.auth)).status).toBe(403);
  });
});
