import { beforeAll, describe, expect, it } from "vitest";
import { api, createUserAndLogin } from "./helpers";

let admin: string;

beforeAll(async () => {
  admin = (await createUserAndLogin("ADMIN")).auth;
});

const picture = {
  imageUrl: "https://pub-x.r2.dev/images/a.webp",
  imageSmallUrl: "https://pub-x.r2.dev/images/a-small.webp",
  width: 1920,
  height: 640,
};
const phone = { mobileImageUrl: "https://pub-x.r2.dev/images/a-phone.webp", mobileWidth: 1080, mobileHeight: 540 };

const post = (body: object) => api().post("/api/admin/banners").set("Authorization", admin).send(body);
const patch = (id: string, body: object) => api().patch(`/api/admin/banners/${id}`).set("Authorization", admin).send(body);
const publicBanners = async () => (await api().get("/api/content/banners")).body.items as { id: string; altText: string }[];

describe("home banners", () => {
  it("lists active banners in order, with only the public fields", async () => {
    expect(await publicBanners()).toEqual([]);

    const a = await post({ ...picture, altText: "First" });
    const b = await post({ ...picture, ...phone, altText: "Second", link: "/notes" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await publicBanners()).map((x) => x.altText)).toEqual(["First", "Second"]);
    expect(Object.keys((await publicBanners())[0]).sort()).toEqual(
      ["altText", "height", "id", "imageSmallUrl", "imageUrl", "link", "mobileHeight", "mobileImageUrl", "mobileWidth", "width"].sort()
    );

    // Hidden banners leave the site but stay in the admin list
    expect((await patch(a.body.item.id, { isActive: false })).status).toBe(200);
    expect((await publicBanners()).map((x) => x.altText)).toEqual(["Second"]);
    expect((await api().get("/api/admin/banners").set("Authorization", admin)).body.items).toHaveLength(2);
    await patch(a.body.item.id, { isActive: true });

    const reorder = (ids: string[]) => api().put("/api/admin/banners/reorder").set("Authorization", admin).send({ ids });
    expect((await reorder([b.body.item.id])).status).toBe(400);
    expect((await reorder([b.body.item.id, a.body.item.id])).status).toBe(200);
    expect((await publicBanners()).map((x) => x.altText)).toEqual(["Second", "First"]);

    for (const id of [a.body.item.id, b.body.item.id]) {
      expect((await api().delete(`/api/admin/banners/${id}`).set("Authorization", admin)).status).toBe(200);
    }
    expect(await publicBanners()).toEqual([]);
  });

  it("links to a page on this site, another website, or nothing", async () => {
    for (const link of ["/", "/notes", "/assamese-medium/class-5/maths/chapter-1", "https://example.com/x?y=1", "http://example.com"]) {
      const res = await post({ ...picture, altText: "Link", link });
      expect(res.status, link).toBe(201);
      expect(res.body.item.link).toBe(link);
      await api().delete(`/api/admin/banners/${res.body.item.id}`).set("Authorization", admin);
    }
    const none = await post({ ...picture, altText: "No link" });
    expect(none.body.item.link).toBeNull();
    await api().delete(`/api/admin/banners/${none.body.item.id}`).set("Authorization", admin);
  });

  it("refuses links that could run code or leave the site in disguise", async () => {
    for (const link of ["javascript:alert(1)", "//evil.com", "/\\evil.com", "/a b", "notes", "ftp://example.com", "data:text/html,x", ""]) {
      expect((await post({ ...picture, altText: "Bad", link })).status, link).toBe(400);
    }
    expect((await post({ ...picture, altText: "Bad", imageUrl: "javascript:alert(1)" })).status).toBe(400);
  });

  it("the description is optional, and a partial edit keeps it", async () => {
    const none = await post(picture);
    expect(none.status).toBe(201);
    expect(none.body.item.altText).toBe("");
    const empty = await post({ ...picture, altText: "   " });
    expect(empty.status).toBe(201);
    expect(empty.body.item.altText).toBe("");
    expect((await post({ ...picture, altText: "x".repeat(161) })).status).toBe(400);

    const named = await post({ ...picture, altText: "Keep me" });
    const hidden = await patch(named.body.item.id, { isActive: false });
    expect(hidden.body.item.altText).toBe("Keep me");
    const cleared = await patch(named.body.item.id, { altText: "" });
    expect(cleared.body.item.altText).toBe("");

    for (const res of [none, empty, named]) {
      await api().delete(`/api/admin/banners/${res.body.item.id}`).set("Authorization", admin);
    }
  });

  it("needs real picture sizes", async () => {
    expect((await post({ ...picture, altText: "No size", width: 0 })).status).toBe(400);
    const { width: _w, ...noWidth } = picture;
    expect((await post({ ...noWidth, altText: "No size" })).status).toBe(400);
  });

  it("keeps a picture and its sizes together", async () => {
    expect((await post({ ...picture, altText: "Half", mobileImageUrl: phone.mobileImageUrl })).status).toBe(400);

    const res = await post({ ...picture, ...phone, altText: "Phone" });
    const id = res.body.item.id;
    expect((await patch(id, { imageUrl: "https://pub-x.r2.dev/images/b.webp" })).status).toBe(400);
    expect((await patch(id, { mobileImageUrl: null })).status).toBe(400);

    const cleared = await patch(id, { mobileImageUrl: null, mobileWidth: null, mobileHeight: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.item.mobileImageUrl).toBeNull();
    await api().delete(`/api/admin/banners/${id}`).set("Authorization", admin);
  });

  it("is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/banners").set("Authorization", student.auth)).status).toBe(403);
    expect((await api().post("/api/admin/banners").set("Authorization", student.auth).send({})).status).toBe(403);
  });
});
