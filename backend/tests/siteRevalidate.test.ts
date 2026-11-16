import { describe, expect, it } from "vitest";
import { siteTagsFor } from "../src/services/siteRevalidate.service";

// Admin changes → which cached areas of the student site are refreshed.
describe("siteTagsFor", () => {
  it("maps admin sections to the site's cache tags", () => {
    expect(siteTagsFor("/notes/:id")).toEqual(["catalog"]);
    expect(siteTagsFor("/chapters/:id/reorder")).toEqual(["catalog"]);
    expect(siteTagsFor("/blog/:id")).toEqual(["blog"]);
    expect(siteTagsFor("/banners")).toEqual(["pages"]);
    expect(siteTagsFor("/settings/:key")).toEqual(["settings", "pages"]);
  });

  it("refreshes nothing for admin-only areas", () => {
    expect(siteTagsFor("/orders/:id/refund")).toEqual([]);
    expect(siteTagsFor("/users/:id")).toEqual([]);
    expect(siteTagsFor("")).toEqual([]);
  });
});
