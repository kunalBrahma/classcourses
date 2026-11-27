import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import { api, createUserAndLogin } from "./helpers";

// Refresh tokens are single-use. When a page fired several calls at once with an
// expired access token, the site sent several refreshes with the same token: the
// first rotated it and the rest hit a delete of a missing row (Prisma P2025),
// which came back as a 404 and signed the student out (live logs, 27 Nov 2026).
// The rotation is now claimed with deleteMany + count, so the losers get a 401.

afterEach(() => vi.restoreAllMocks());

const loginTokens = async () => {
  const { email } = await createUserAndLogin();
  const res = await api().post("/api/auth/login").send({ email, password: "Password123!" });
  return res.body.refreshToken as string;
};

describe("refresh token rotation race", () => {
  it("a request that read the token before a parallel one rotated it gets 401, not 404", async () => {
    const refreshToken = await loginTokens();
    // What the losing request saw: the row as it was before the winner deleted it.
    const staleRow = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });

    expect((await api().post("/api/auth/refresh").send({ refreshToken })).status).toBe(200); // the winner

    // Replay the loser: its lookup still finds the (already deleted) row.
    vi.spyOn(prisma.refreshToken, "findUnique").mockResolvedValueOnce(staleRow as never);
    const loser = await api().post("/api/auth/refresh").send({ refreshToken });
    expect(loser.status).toBe(401);
    expect(loser.body.accessToken).toBeUndefined();
  });

  it("parallel refreshes give at most one new pair and never a 404", async () => {
    const refreshToken = await loginTokens();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => api().post("/api/auth/refresh").send({ refreshToken }))
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.every((s) => s === 200 || s === 401)).toBe(true);

    const winner = results.find((r) => r.status === 200)!;
    expect((await api().post("/api/auth/refresh").send({ refreshToken: winner.body.refreshToken })).status).toBe(200);
    expect((await api().post("/api/auth/refresh").send({ refreshToken })).status).toBe(401);
  });
});
