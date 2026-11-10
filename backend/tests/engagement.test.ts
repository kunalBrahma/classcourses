import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import * as mailer from "../src/utils/mailer";
import { api, classIdOf, createUserAndLogin } from "./helpers";

// Phase 14 (client requirements of 6 Nov 2026): Like / Save / Share, blog,
// announcements, notices and warnings.

let founder: string;
let chapterId: string;
let hiddenChapterId: string;

const as = (auth: string | null) => {
  const set = <T extends { set: (k: string, v: string) => T }>(r: T) => (auth ? r.set("Authorization", auth) : r);
  return {
    get: (p: string) => set(api().get(p)),
    post: (p: string, b: object = {}) => set(api().post(p)).send(b),
    put: (p: string, b: object = {}) => set(api().put(p)).send(b),
    patch: (p: string, b: object = {}) => set(api().patch(p)).send(b),
    delete: (p: string) => set(api().delete(p)),
  };
};
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

beforeAll(async () => {
  await seedCatalog();
  founder = (await createUserAndLogin("ADMIN")).auth;
  const subject = await prisma.subject.findFirstOrThrow({ where: { slug: "english", medium: { slug: "english-medium" }, classLevel: { slug: "class-9" } } });
  chapterId = (await prisma.chapter.findFirstOrThrow({ where: { subjectId: subject.id, slug: "chapter-1" } })).id;
  hiddenChapterId = (await prisma.chapter.update({ where: { subjectId_slug: { subjectId: subject.id, slug: "chapter-2" } }, data: { isPublished: false } })).id;
});
afterEach(() => vi.restoreAllMocks());

const publishPost = async (title: string, extra: object = {}) =>
  (await as(founder).post("/api/admin/blog/posts", { title, bodyHtml: "<h2>Hello</h2><p>Some words about studying.</p>", status: "PUBLISHED", ...extra })).body.post;

describe("like and save", () => {
  it("one like per account with a total; unlike; guests see the total only", async () => {
    const a = await createUserAndLogin();
    const b = await createUserAndLogin();
    expect((await as(null).get(`/api/reactions?chapterId=${chapterId}`)).body).toEqual({ likes: 0, liked: false, saved: false });
    expect((await as(null).put("/api/reactions/like", { chapterId, on: true })).status).toBe(401);

    expect((await as(a.auth).put("/api/reactions/like", { chapterId, on: true })).body).toEqual({ likes: 1, liked: true, saved: false });
    // Pressing again (or two quick taps) doesn't add a second like
    await Promise.all([as(a.auth).put("/api/reactions/like", { chapterId, on: true }), as(a.auth).put("/api/reactions/like", { chapterId, on: true })]);
    expect((await as(b.auth).put("/api/reactions/like", { chapterId, on: true })).body.likes).toBe(2);
    expect((await as(a.auth).put("/api/reactions/like", { chapterId, on: false })).body).toEqual({ likes: 1, liked: false, saved: false });
    expect((await as(null).get(`/api/reactions?chapterId=${chapterId}`)).body.likes).toBe(1);
  });

  it("only visible items; exactly one target", async () => {
    const a = await createUserAndLogin();
    expect((await as(a.auth).put("/api/reactions/like", { chapterId: hiddenChapterId, on: true })).status).toBe(404);
    expect((await as(a.auth).put("/api/reactions/save", { on: true })).status).toBe(400);
    const draft = (await as(founder).post("/api/admin/blog/posts", { title: "Draft only", bodyHtml: "<p>x</p>" })).body.post;
    expect((await as(a.auth).put("/api/reactions/save", { blogPostId: draft.id, on: true })).status).toBe(404);
    expect((await as(a.auth).put("/api/reactions/save", { chapterId, blogPostId: draft.id, on: true })).status).toBe(400);
  });

  it("saved items show in the profile (newest first), stay after signing in again, and can be removed", async () => {
    const a = await createUserAndLogin();
    const post = await publishPost("How to revise for exams");
    await as(a.auth).put("/api/reactions/save", { chapterId, on: true });
    await as(a.auth).put("/api/reactions/save", { blogPostId: post.id, on: true });
    const again = await api().post("/api/auth/login").send({ email: a.email, password: "Password123!" });
    const saved = (await as(`Bearer ${again.body.accessToken}`).get("/api/users/me/saved")).body;
    expect(saved.total).toBe(2);
    expect(saved.items[0]).toMatchObject({ type: "BLOG_POST", title: "How to revise for exams", href: `/blog/${post.slug}`, context: "Blog", available: true });
    expect(saved.items[1]).toMatchObject({ type: "CHAPTER", context: "Class 9 · English", href: "/english-medium/class-9/english/chapter-1", available: true });

    // Unpublished later: still listed, marked unavailable, removable
    await as(founder).patch(`/api/admin/blog/posts/${post.id}`, { status: "DRAFT" });
    const items = (await as(a.auth).get("/api/users/me/saved")).body.items;
    expect(items[0].available).toBe(false);
    expect((await as(a.auth).delete(`/api/users/me/saved/${items[0].id}`)).status).toBe(200);
    expect((await as(a.auth).get("/api/users/me/saved")).body.total).toBe(1);
    // Another student's item can't be removed
    const b = await createUserAndLogin();
    expect((await as(b.auth).delete(`/api/users/me/saved/${items[1].id}`)).status).toBe(404);
    expect((await as(a.auth).get(`/api/reactions?chapterId=${chapterId}`)).body.saved).toBe(true);
  });

  it("admin moderation: lists, top items, removes a like, clears a student's likes", async () => {
    const spammer = await createUserAndLogin();
    const sid = await userId(spammer.email);
    const post = await publishPost("Spam target");
    await as(spammer.auth).put("/api/reactions/like", { blogPostId: post.id, on: true });
    await as(spammer.auth).put("/api/reactions/like", { chapterId, on: true });

    const list = (await as(founder).get(`/api/admin/reactions?kind=like&userId=${sid}`)).body;
    expect(list.total).toBe(2);
    expect(list.items[0]).toMatchObject({ user: { email: spammer.email }, type: "CHAPTER" });
    const summary = (await as(founder).get("/api/admin/reactions/summary")).body;
    expect(summary.mostLiked[0]).toMatchObject({ targetId: chapterId, type: "CHAPTER" });
    expect(summary.totals.likes).toBeGreaterThanOrEqual(2);

    const likeId = (await prisma.like.findFirstOrThrow({ where: { userId: sid, blogPostId: post.id } })).id;
    expect((await as(founder).delete(`/api/admin/reactions/likes/${likeId}`)).status).toBe(200);
    expect((await as(founder).post(`/api/admin/reactions/users/${sid}/clear-likes`, { reason: "Spam" })).body.count).toBe(1);
    expect(await prisma.like.count({ where: { userId: sid } })).toBe(0);
  });
});

describe("blog", () => {
  it("drafts stay hidden; publishing sets the date; links are automatic and fixed on rename", async () => {
    const draft = (await as(founder).post("/api/admin/blog/posts", { title: "Exam Tips & Tricks", bodyHtml: "<p>Soon</p><script>x</script>" })).body.post;
    expect(draft).toMatchObject({ slug: "exam-tips-and-tricks", status: "DRAFT", publishedAt: null, bodyHtml: "<p>Soon</p>" });
    expect((await as(null).get(`/api/content/blog/${draft.slug}`)).status).toBe(404);

    // Can't publish an empty post
    const empty = (await as(founder).post("/api/admin/blog/posts", { title: "Empty" })).body.post;
    expect((await as(founder).patch(`/api/admin/blog/posts/${empty.id}`, { status: "PUBLISHED" })).status).toBe(400);

    const published = (await as(founder).patch(`/api/admin/blog/posts/${draft.id}`, { status: "PUBLISHED", title: "Exam tips (new)" })).body.post;
    expect(published.slug).toBe("exam-tips-and-tricks");
    expect(published.publishedAt).toBeTruthy();
    const page = (await as(null).get("/api/content/blog/exam-tips-and-tricks")).body.post;
    expect(page).toMatchObject({ title: "Exam tips (new)", excerpt: "Soon", readMinutes: 1 });

    // Same name again → a "-2" link; a taken link is refused
    expect((await as(founder).post("/api/admin/blog/posts", { title: "Exam Tips & Tricks" })).body.post.slug).toBe("exam-tips-and-tricks-2");
    expect((await as(founder).patch(`/api/admin/blog/posts/${empty.id}`, { slug: "exam-tips-and-tricks" })).status).toBe(409);
    // A future date waits
    const later = await publishPost("Coming next week", { publishedAt: new Date(Date.now() + 7 * 864e5).toISOString() });
    expect((await as(null).get(`/api/content/blog/${later.slug}`)).status).toBe(404);
  });

  it("categories: list filter, hidden-from-chips, delete keeps the posts", async () => {
    const cat = (await as(founder).post("/api/admin/blog/categories", { name: "Study Tips" })).body.category;
    expect(cat.slug).toBe("study-tips");
    expect((await as(founder).post("/api/admin/blog/categories", { name: "study tips" })).status).toBe(409);
    await publishPost("Morning routine", { categoryId: cat.id, excerpt: "Wake up early." });
    const list = (await as(null).get("/api/content/blog?category=study-tips")).body;
    expect(list.posts.map((p: { title: string }) => p.title)).toEqual(["Morning routine"]);
    expect(list.posts[0]).toMatchObject({ excerpt: "Wake up early.", category: { name: "Study Tips", slug: "study-tips" } });
    expect(list.categories).toEqual([{ name: "Study Tips", slug: "study-tips" }]);
    expect(list.posts[0].bodyHtml).toBeUndefined();

    await as(founder).patch(`/api/admin/blog/categories/${cat.id}`, { isActive: false });
    expect((await as(null).get("/api/content/blog")).body.categories).toEqual([]);
    await as(founder).delete(`/api/admin/blog/categories/${cat.id}`);
    expect((await prisma.blogPost.findFirstOrThrow({ where: { title: "Morning routine" } })).categoryId).toBeNull();
  });

  it("deleting a post removes its likes and saves; the activity log records publishing", async () => {
    const s = await createUserAndLogin();
    const post = await publishPost("Short lived");
    await as(s.auth).put("/api/reactions/like", { blogPostId: post.id, on: true });
    await as(s.auth).put("/api/reactions/save", { blogPostId: post.id, on: true });
    expect((await as(founder).delete(`/api/admin/blog/posts/${post.id}`)).status).toBe(200);
    expect(await prisma.like.count({ where: { blogPostId: post.id } })).toBe(0);
    expect(await prisma.savedItem.count({ where: { blogPostId: post.id } })).toBe(0);
    await new Promise((r) => setTimeout(r, 150));
    const actions = (await prisma.adminActivity.findMany({ where: { targetId: post.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["blog.create", "blog.delete"]));
  });
});

describe("announcements", () => {
  it("published ones in their window, for their audience and class", async () => {
    const class7 = await classIdOf(7);
    const mk = (body: object) => as(founder).post("/api/admin/announcements", { isPublished: true, ...body });
    await mk({ title: "Exams start Monday", bodyHtml: "<p>Good luck!</p><img src=x onerror=alert(1)>" });
    await mk({ title: "Draft", isPublished: false });
    await mk({ title: "Ended", endsAt: new Date(Date.now() - 1000).toISOString() });
    await mk({ title: "Later", startsAt: new Date(Date.now() + 864e5).toISOString() });
    await mk({ title: "Students only", audience: "STUDENTS" });
    await mk({ title: "Class 7 only", audience: "STUDENTS", classLevelId: class7 });
    expect((await mk({ title: "Bad", audience: "EVERYONE", classLevelId: class7 })).status).toBe(400);
    expect((await mk({ title: "Bad window", startsAt: "2026-12-02T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" })).status).toBe(400);

    const guest = (await as(null).get("/api/content/announcements")).body.items;
    expect(guest.map((a: { title: string }) => a.title)).toEqual(["Exams start Monday"]);
    expect(guest[0].bodyHtml).not.toContain("onerror");

    const student = await createUserAndLogin();
    expect((await as(student.auth).get("/api/content/announcements")).body.items.map((a: { title: string }) => a.title).sort()).toEqual(["Exams start Monday", "Students only"]);
    await prisma.user.update({ where: { email: student.email }, data: { classLevelId: class7 } });
    // Newest first
    expect((await as(student.auth).get("/api/content/announcements")).body.items.map((a: { title: string }) => a.title)).toEqual(["Class 7 only", "Students only", "Exams start Monday"]);
  });

  it("unpublish, reorder (full list) and remove", async () => {
    const items = (await as(founder).get("/api/admin/announcements")).body.items as { id: string; title: string }[];
    const first = items[0];
    await as(founder).patch(`/api/admin/announcements/${first.id}`, { isPublished: false });
    expect((await as(founder).put("/api/admin/announcements/reorder", { ids: items.slice(1).map((i) => i.id) })).status).toBe(400);
    expect((await as(founder).put("/api/admin/announcements/reorder", { ids: [...items].reverse().map((i) => i.id) })).status).toBe(200);
    expect((await as(founder).delete(`/api/admin/announcements/${first.id}`)).status).toBe(200);
    expect(await prisma.announcement.count({ where: { id: first.id } })).toBe(0);
  });
});

describe("notifications", () => {
  it("a notice to everyone reaches every student once; read state is per student", async () => {
    const a = await createUserAndLogin();
    const b = await createUserAndLogin();
    expect((await as(founder).post("/api/admin/notices", { to: "all", kind: "NOTICE", title: "Site update", body: "New chapters for Class 10." })).status).toBe(201);
    expect((await as(founder).post("/api/admin/notices", { to: "all", kind: "WARNING", title: "No", body: "Warnings are personal" })).status).toBe(400);
    expect((await as(founder).post("/api/admin/notices", { to: "all", kind: "NOTICE", title: "No", body: "Not by email", email: true })).status).toBe(400);
    expect((await as(a.auth).get("/api/users/me/notifications/unread")).body.unread).toBe(1);

    const inbox = (await as(a.auth).get("/api/users/me/notifications")).body;
    expect(inbox.items[0]).toMatchObject({ title: "Site update", kind: "NOTICE", toEveryone: true, read: false });
    expect((await as(a.auth).post("/api/users/me/notifications/read", { ids: [inbox.items[0].id] })).body.unread).toBe(0);
    expect((await as(b.auth).get("/api/users/me/notifications/unread")).body.unread).toBe(1);
    expect((await as(b.auth).post("/api/users/me/notifications/read", { all: true })).body.unread).toBe(0);
  });

  it("a warning to one student, emailed too; only they see it; the admin sees the count and the email result", async () => {
    const sent: { to: string; title: string }[] = [];
    vi.spyOn(mailer, "sendNoticeEmail").mockImplementation(async (to, n) => {
      sent.push({ to, title: n.title });
      return "sent";
    });
    const bad = await createUserAndLogin();
    const other = await createUserAndLogin();
    const id = await userId(bad.email);
    const res = await as(founder).post("/api/admin/notices", { to: id, kind: "WARNING", title: "Please be polite", body: "Your Helpline message was rude.\n\nNext time the account is suspended.", email: true });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/emailed/);
    expect(sent).toEqual([{ to: bad.email, title: "Please be polite" }]);
    expect((await as(bad.auth).get("/api/users/me/notifications")).body.items[0]).toMatchObject({ kind: "WARNING", toEveryone: false });
    const otherTitles = (await as(other.auth).get("/api/users/me/notifications")).body.items.map((n: { title: string }) => n.title);
    expect(otherTitles).not.toContain("Please be polite");
    expect((await as(founder).get(`/api/admin/users/${id}`)).body.user.warnings).toBe(1);
    const log = (await as(founder).get(`/api/admin/notices?userId=${id}`)).body.items;
    expect(log[0]).toMatchObject({ emailNote: "sent", user: { email: bad.email } });

    // A student can't mark someone else's notice read; the admin can remove it
    await as(other.auth).post("/api/users/me/notifications/read", { ids: [log[0].id] });
    expect(await prisma.notificationRead.count({ where: { notificationId: log[0].id } })).toBe(0);
    expect((await as(founder).delete(`/api/admin/notices/${log[0].id}`)).status).toBe(200);
    expect((await as(bad.auth).get("/api/users/me/notifications/unread")).body.unread).toBe(1); // only the "everyone" one
  });

  it("the site tells the student when an admin changes their coins", async () => {
    const s = await createUserAndLogin();
    const id = await userId(s.email);
    await as(founder).post(`/api/admin/users/${id}/coins`, { delta: 15, note: "Sorry about the quiz bug" });
    const n = (await as(s.auth).get("/api/users/me/notifications")).body.items.find((i: { kind: string }) => i.kind === "ACCOUNT");
    expect(n).toMatchObject({ title: "15 coins added", link: "/profile" });
    expect(n.body).toContain("Sorry about the quiz bug");
  });

  it("helpers: content can manage the blog; only Students can send notices", async () => {
    await as(founder).post("/api/admin/team", { email: "blog-helper@test.local", password: "HelperPassword123!", permissions: ["content"] });
    const helper = `Bearer ${(await api().post("/api/auth/login").send({ email: "blog-helper@test.local", password: "HelperPassword123!" })).body.accessToken}`;
    expect((await as(helper).post("/api/admin/blog/posts", { title: "From a helper" })).status).toBe(201);
    expect((await as(helper).get("/api/admin/announcements")).status).toBe(200);
    expect((await as(helper).post("/api/admin/notices", { to: "all", kind: "NOTICE", title: "Hello all", body: "Not allowed" })).status).toBe(403);
    expect((await as(helper).get("/api/admin/reactions")).status).toBe(403);
  });

  it("erasing an account removes its likes, saves and notices; the export lists them", async () => {
    const s = await createUserAndLogin();
    const id = await userId(s.email);
    await as(s.auth).put("/api/reactions/like", { chapterId, on: true });
    await as(s.auth).put("/api/reactions/save", { chapterId, on: true });
    await as(founder).post("/api/admin/notices", { to: id, kind: "NOTICE", title: "Hello there", body: "Just checking in" });
    const data = JSON.parse((await as(founder).get(`/api/admin/users/${id}/export`)).text);
    expect(data.likes).toHaveLength(1);
    expect(data.saved[0]).toMatchObject({ type: "chapter" });
    expect(data.notices[0]).toMatchObject({ title: "Hello there" });
    await as(founder).delete(`/api/admin/users/${id}`).send({ reason: "Asked to delete", confirmEmail: s.email });
    expect(await prisma.like.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.savedItem.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: id } })).toBe(0);
  });
});
