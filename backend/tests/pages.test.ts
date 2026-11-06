import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedPages } from "../prisma/seed";
import { api, createUserAndLogin } from "./helpers";

let admin: string;

beforeAll(async () => {
  admin = (await createUserAndLogin("ADMIN")).auth;
});

const put = (path: string, body: object) => api().put(path).set("Authorization", admin).send(body);
const publish = (slug: string) => put(`/api/admin/pages/${slug}`, { isPublished: true });

describe("seeded drafts", () => {
  it("creates the five pages and the FAQ as unpublished drafts", async () => {
    expect(await seedPages()).toEqual({ pagesCreated: 5, faqCreated: 10 });
    expect(await prisma.page.count({ where: { isPublished: true } })).toBe(0);
    expect(await prisma.faqItem.count({ where: { isPublished: true } })).toBe(0);

    expect((await api().get("/api/content/pages")).body.pages).toEqual([]);
    expect((await api().get("/api/content/pages/privacy")).status).toBe(404);
    expect((await api().get("/api/content/faq")).body.items).toEqual([]);
  });

  it("re-seeding never overwrites the owner's edits", async () => {
    await put("/api/admin/pages/about", { title: "About Class Course (edited)" });
    expect(await seedPages()).toEqual({ pagesCreated: 0, faqCreated: 0 });
    expect((await prisma.page.findUniqueOrThrow({ where: { slug: "about" } })).title).toBe("About Class Course (edited)");
  });

  it("the drafts survive the sanitiser intact (links, lists, headings)", async () => {
    const refund = await prisma.page.findUniqueOrThrow({ where: { slug: "refund-policy" } });
    expect(refund.bodyHtml).toContain('<a href="mailto:{{contact.email}}"');
    expect(refund.bodyHtml).toContain("<h3>2. When a refund or correction may be provided</h3>");
    const terms = await prisma.page.findUniqueOrThrow({ where: { slug: "terms" } });
    expect(terms.bodyHtml).toContain('<a href="/refund-policy"');
  });
});

describe("publishing & live tokens", () => {
  it("lists the legal pages Razorpay needs once published, in footer order", async () => {
    for (const slug of ["refund-policy", "privacy", "terms", "contact"]) {
      expect((await publish(slug)).status).toBe(200);
    }
    const list = await api().get("/api/content/pages");
    expect(list.body.pages.map((p: { slug: string }) => p.slug)).toEqual(["contact", "privacy", "terms", "refund-policy"]);
    expect(list.body.pages[0].updatedAt).toBeTruthy();
  });

  it("fills tokens from current settings", async () => {
    const res = await api().get("/api/content/pages/contact");
    expect(res.body.page.bodyHtml).toContain('<a href="mailto:about.classcourse@gmail.com" target="_blank" rel="noopener noreferrer nofollow">about.classcourse@gmail.com</a>');
    expect(res.body.page.bodyHtml).not.toContain("{{");

    const terms = await api().get("/api/content/pages/terms");
    // Operator and Grievance Officer come from the `operator` setting
    expect(terms.body.page.bodyHtml).toContain("Operated by Class Course, managed by Mr. Ajaharul Ahmed, Founder");
    expect(terms.body.page.bodyHtml).toContain("The Grievance Officer is Mr. Ajaharul Ahmed, Founder, Class Course");
    expect(terms.body.page.bodyHtml).toContain("acknowledge complaints within 48 hours and resolve ordinary complaints within 7 days");
    expect(terms.body.page.bodyHtml).not.toContain("{{");
    expect(terms.body.page.bodyHtml).not.toMatch(/\bCEO\b/);
  });

  it("operator details follow the admin's settings", async () => {
    const saved = await put("/api/admin/settings/operator", { address: "New Road, Nagaon, Assam", replyWithinHours: 24 });
    expect(saved.status).toBe(200);
    const privacy = await api().get("/api/content/pages/privacy");
    expect(privacy.body.page.bodyHtml).toContain("<strong>Address:</strong> New Road, Nagaon, Assam");
    expect((await api().get("/api/content/pages/terms")).body.page.bodyHtml).toContain("within 24 hours");
    // Public (no secrets), so the footer can show it
    expect((await api().get("/api/settings/public")).body.settings.operator).toMatchObject({
      address: "New Road, Nagaon, Assam",
      grievanceEmail: "mrajaharulahmed.business@gmail.com",
    });
    expect((await put("/api/admin/settings/operator", { grievanceEmail: "not-an-email" })).status).toBe(400);
    await api().delete("/api/admin/settings/operator").set("Authorization", admin);
  });

  it("the FAQ follows the admin's quiz and coin settings", async () => {
    const items = await prisma.faqItem.findMany({ orderBy: { order: "asc" } });
    for (const item of items) await api().patch(`/api/admin/faq/${item.id}`).set("Authorization", admin).send({ isPublished: true });

    await put("/api/admin/settings/quiz", { secondsPerQuestion: 15 });
    await put("/api/admin/settings/coins", { coinValuePaise: 25 });
    const faq = await api().get("/api/content/faq");
    const byQ = Object.fromEntries(faq.body.items.map((i: { question: string; answerHtml: string }) => [i.question, i.answerHtml]));
    expect(Object.keys(byQ)).toContain("Why only 15 seconds per question?");
    expect(byQ["What are coins?"]).toContain("Each coin is worth ₹0.25 off premium notes, up to 50%");
    await api().delete("/api/admin/settings/quiz").set("Authorization", admin);
    await api().delete("/api/admin/settings/coins").set("Authorization", admin);
  });

  it("escapes token values in HTML, but not in plain-text FAQ questions", async () => {
    await put("/api/admin/settings/site", { name: 'A & <B> "Tutors"' });
    const about = await publish("about");
    expect(about.status).toBe(200);
    const res = await api().get("/api/content/pages/about");
    expect(res.body.page.bodyHtml).toContain("<strong>A &amp; &lt;B&gt; &quot;Tutors&quot;</strong>");
    expect(res.body.page.bodyHtml).not.toContain("<B>");

    const faq = await api().get("/api/content/faq");
    expect(faq.body.items[0].question).toBe('Is A & <B> "Tutors" free?');
    await api().delete("/api/admin/settings/site").set("Authorization", admin);
  });

  it("leaves unknown tokens visible so typos get noticed", async () => {
    await put("/api/admin/pages/about", { bodyHtml: "<p>Hello {{site.nmae}} and {{site.name}}</p>" });
    const res = await api().get("/api/content/pages/about");
    expect(res.body.page.bodyHtml).toBe("<p>Hello {{site.nmae}} and Class Course</p>");
  });
});

describe("editing", () => {
  it("sanitises page HTML", async () => {
    const res = await put("/api/admin/pages/about", {
      bodyHtml: '<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="https://evil"></iframe>',
    });
    expect(res.body.page.bodyHtml).toBe("<p>Hi</p>");
  });

  it("won't publish an empty page, and rejects unknown slugs", async () => {
    const empty = await put("/api/admin/pages/about", { bodyHtml: "<p> </p>" });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/content before publishing/);
    expect((await put("/api/admin/pages/secret-page", { title: "x", bodyHtml: "<p>x</p>" })).status).toBe(404);
  });

  it("admin view returns raw tokens plus a rendered preview", async () => {
    const res = await api().get("/api/admin/pages/contact").set("Authorization", admin);
    expect(res.body.page.bodyHtml).toContain("{{contact.email}}");
    expect(res.body.preview).toContain("about.classcourse@gmail.com");
    expect(res.body.tokens).toContain("quiz.secondsPerQuestion");
  });

  it("FAQ: create (question kept as plain text), reorder, unpublish, delete", async () => {
    const created = await api()
      .post("/api/admin/faq")
      .set("Authorization", admin)
      .send({ question: "<b>Do you have videos?</b>", answerHtml: "<p>Yes, on YouTube.</p>", isPublished: true });
    expect(created.status).toBe(201);
    expect(created.body.item.question).toBe("Do you have videos?");

    const all = await prisma.faqItem.findMany({ orderBy: { order: "asc" } });
    const ids = [created.body.item.id, ...all.filter((i) => i.id !== created.body.item.id).map((i) => i.id)];
    expect((await put("/api/admin/faq/reorder", { ids })).status).toBe(200);
    expect((await api().get("/api/content/faq")).body.items[0].question).toBe("Do you have videos?");

    await api().patch(`/api/admin/faq/${created.body.item.id}`).set("Authorization", admin).send({ isPublished: false });
    expect((await api().get("/api/content/faq")).body.items[0].question).not.toBe("Do you have videos?");

    expect((await api().delete(`/api/admin/faq/${created.body.item.id}`).set("Authorization", admin)).status).toBe(200);
    expect((await put("/api/admin/faq/reorder", { ids: ids.slice(1, 3) })).status).toBe(400);
  });

  it("standard text: the client's own policies, loaded into the editor without saving", async () => {
    const res = await api().get("/api/admin/pages/refund-policy/standard").set("Authorization", admin);
    expect(res.status).toBe(200);
    expect(res.body.standard.title).toBe("Refund Policy");
    expect(res.body.standard.bodyHtml).toContain("{{operator.grievanceName}}");
    expect(res.body.standard.preview).toContain("Mr. Ajaharul Ahmed");
    expect(res.body.standard.preview).toContain("Cashfree Payments");

    const before = await prisma.page.findUniqueOrThrow({ where: { slug: "terms" } });
    const terms = await api().get("/api/admin/pages/terms/standard").set("Authorization", admin);
    expect(terms.body.standard.title).toBe("Terms and Conditions");
    expect(await prisma.page.findUniqueOrThrow({ where: { slug: "terms" } })).toEqual(before);

    // Saving it makes the page "match" the standard text
    await put("/api/admin/pages/terms", { title: terms.body.standard.title, bodyHtml: terms.body.standard.bodyHtml });
    expect((await api().get("/api/admin/pages/terms/standard").set("Authorization", admin)).body.matchesCurrent).toBe(true);
    expect((await api().get("/api/admin/pages/nope/standard").set("Authorization", admin)).status).toBe(404);
  });

  it("is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/pages/terms/standard").set("Authorization", student.auth)).status).toBe(403);
    expect((await api().put("/api/admin/pages/about").set("Authorization", student.auth).send({ title: "x" })).status).toBe(403);
    expect((await api().post("/api/admin/faq").set("Authorization", student.auth).send({})).status).toBe(403);
  });
});
