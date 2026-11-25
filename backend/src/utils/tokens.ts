import prisma from "../config/prisma";
import { generateAccessToken, generateRefreshToken } from "./jwt";

/** A new access + refresh token pair (the access token carries the account's current tokenVersion). */
export const issueTokenPair = async (userId: string, email: string) => {
  const { tokenVersion } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  const accessToken = generateAccessToken({ userId, email, tv: tokenVersion });
  const { token: refreshToken, expiresAt } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
};
