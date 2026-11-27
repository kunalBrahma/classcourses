import { beforeAll, describe, expect, it } from "vitest";
import { api, createUserAndLogin } from "./helpers";

let auth: string;

beforeAll(async () => {
  auth = (await createUserAndLogin("ADMIN")).auth;
});

describe("generic settings", () => {
  it("lists every group with defaults and a source", async () => {
    const res = await api().get("/api/admin/settings").set("Authorization", auth);
    const byKey = Object.fromEntries(res.body.settings.map((s: { key: string }) => [s.key, s]));
    expect(byKey.quiz.source).toBe("default");
    expect(byKey.quiz.value).toEqual({ questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 7, dailyLimit: 10, autoChapterQuizzes: true });
    expect(byKey.coins.value).toEqual({
      perPass: 10,
      coinValuePaise: 10,
      maxDiscountPercent: 50,
      awardRule: "firstPassPerChapter",
      validityDays: 90,
    });
    expect(byKey.contact.value.email).toBe("about.classcourse@gmail.com");
    expect(Object.keys(byKey)).toEqual(expect.arrayContaining(["storage", "smtp", "social", "site"]));
  });

  it("partial update keeps the other fields and is saved to the database", async () => {
    const res = await api().put("/api/admin/settings/quiz").set("Authorization", auth).send({ passMark: 8 });
    expect(res.status).toBe(200);
    expect(res.body.setting.source).toBe("database");
    expect(res.body.setting.value).toEqual({ questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 8, dailyLimit: 10, autoChapterQuizzes: true });

    const again = await api().get("/api/admin/settings/quiz").set("Authorization", auth);
    expect(again.body.setting.value.passMark).toBe(8);
  });

  it("rejects invalid values with a 400", async () => {
    const res = await api().put("/api/admin/settings/quiz").set("Authorization", auth).send({ secondsPerQuestion: 1 });
    expect(res.status).toBe(400);
    const coins = await api().put("/api/admin/settings/coins").set("Authorization", auth).send({ maxDiscountPercent: 150 });
    expect(coins.status).toBe(400);
  });

  it("unknown setting keys return 404", async () => {
    expect((await api().get("/api/admin/settings/nope").set("Authorization", auth)).status).toBe(404);
    expect((await api().put("/api/admin/settings/sitee").set("Authorization", auth).send({})).status).toBe(404);
  });

  it("reset returns to defaults", async () => {
    const res = await api().delete("/api/admin/settings/quiz").set("Authorization", auth);
    expect(res.body.setting.source).toBe("default");
    expect(res.body.setting.value.passMark).toBe(7);
  });

  it("social links accept blank (cleared) values", async () => {
    const res = await api().put("/api/admin/settings/social").set("Authorization", auth).send({ twitter: "" });
    expect(res.status).toBe(200);
    expect(res.body.setting.value.twitter).toBeNull();
    expect(res.body.setting.value.youtube).toBe("https://yt.openinapp.co/classcourse");
    await api().delete("/api/admin/settings/social").set("Authorization", auth);
  });
});

describe("WhatsApp support number (contact setting)", () => {
  const put = (body: object) => api().put("/api/admin/settings/contact").set("Authorization", auth).send(body);
  const publicContact = async () => (await api().get("/api/settings/public")).body.settings.contact;

  it("is off until the admin sets a number", async () => {
    expect(await publicContact()).toMatchObject({ whatsappNumber: null, whatsappFloating: true });
  });

  it("stores digits with the country code; a 10-digit Indian mobile gets 91", async () => {
    expect((await put({ whatsappNumber: "98765 43210" })).body.setting.value.whatsappNumber).toBe("919876543210");
    expect((await put({ whatsappNumber: "+91 98765-43210" })).body.setting.value.whatsappNumber).toBe("919876543210");
    expect((await put({ whatsappNumber: "09876543210" })).body.setting.value.whatsappNumber).toBe("919876543210");
    expect((await put({ whatsappNumber: "+44 7700 900123" })).body.setting.value.whatsappNumber).toBe("447700900123");
    // A partial save of something else keeps the number (and doesn't re-add 91)
    expect((await put({ whatsappFloating: false })).body.setting.value).toMatchObject({ whatsappNumber: "447700900123", whatsappFloating: false });
    expect(await publicContact()).toMatchObject({ whatsappNumber: "447700900123", whatsappFloating: false, email: expect.any(String) });
  });

  it("refuses a wrong number and clears with an empty one", async () => {
    const bad = await put({ whatsappNumber: "12345" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/country code/);
    expect((await put({ whatsappNumber: "" })).body.setting.value.whatsappNumber).toBeNull();
    await api().delete("/api/admin/settings/contact").set("Authorization", auth);
  });
});

describe("public settings", () => {
  it("exposes only non-secret groups, without auth", async () => {
    const res = await api().get("/api/settings/public");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.settings).sort()).toEqual(["coins", "contact", "operator", "quiz", "referral", "site", "social"]);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/secret|password|accessKey/i);
    if (process.env.R2_SECRET_ACCESS_KEY) expect(raw).not.toContain(process.env.R2_SECRET_ACCESS_KEY);
  });
});
