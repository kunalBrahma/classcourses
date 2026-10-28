import { beforeAll, describe, expect, it } from "vitest";
import { api, createUserAndLogin } from "./helpers";

let admin: string;

beforeAll(async () => {
  admin = (await createUserAndLogin("ADMIN")).auth;
});

const post = (body: object) => api().post("/api/admin/news").set("Authorization", admin).send(body);
const publicNews = async () => (await api().get("/api/content/news")).body.items as { title: string }[];

describe("news links", () => {
  it("adds, edits, hides, reorders and deletes links; the public list follows", async () => {
    expect(await publicNews()).toEqual([]);

    const a = await post({ source: "India Today", title: "Education updates", url: "https://www.indiatoday.in/education-today" });
    const b = await post({ source: "Indian Express", title: "National education news", url: "https://indianexpress.com/section/education/" });
    expect(a.status).toBe(201);
    expect(a.body.item).toMatchObject({ isActive: true, order: 0 });
    expect(b.body.item.order).toBe(1);
    expect((await publicNews()).map((n) => n.title)).toEqual(["Education updates", "National education news"]);
    // Public items carry only what the card needs.
    expect(Object.keys((await publicNews())[0]).sort()).toEqual(["id", "source", "title", "url"]);

    const patch = (id: string, body: object) => api().patch(`/api/admin/news/${id}`).set("Authorization", admin).send(body);
    expect((await patch(a.body.item.id, { title: "School updates" })).body.item.title).toBe("School updates");
    await patch(b.body.item.id, { isActive: false });
    expect((await publicNews()).map((n) => n.title)).toEqual(["School updates"]);
    await patch(b.body.item.id, { isActive: true });

    const reorder = (ids: string[]) => api().put("/api/admin/news/reorder").set("Authorization", admin).send({ ids });
    expect((await reorder([b.body.item.id])).status).toBe(400); // must send every link
    expect((await reorder([b.body.item.id, a.body.item.id])).status).toBe(200);
    expect((await publicNews()).map((n) => n.title)).toEqual(["National education news", "School updates"]);

    // The admin list shows hidden links too.
    await patch(a.body.item.id, { isActive: false });
    expect((await api().get("/api/admin/news").set("Authorization", admin)).body.items).toHaveLength(2);

    for (const id of [a.body.item.id, b.body.item.id]) {
      expect((await api().delete(`/api/admin/news/${id}`).set("Authorization", admin)).status).toBe(200);
    }
    expect(await publicNews()).toEqual([]);
  });

  it("only accepts http(s) links and complete details", async () => {
    expect((await post({ source: "X", title: "Bad", url: "javascript:alert(1)" })).status).toBe(400);
    expect((await post({ source: "X", title: "Bad", url: "not a link" })).status).toBe(400);
    expect((await post({ source: "", title: "No source", url: "https://example.com" })).status).toBe(400);
  });

  it("is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/news").set("Authorization", student.auth)).status).toBe(403);
    expect((await api().post("/api/admin/news").set("Authorization", student.auth).send({})).status).toBe(403);
  });
});
