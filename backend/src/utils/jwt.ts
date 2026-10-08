import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

export interface TokenPayload {
  userId: string;
  email: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
};

// Refresh tokens are opaque random strings, not JWTs: they're stored in the
// DB so a single row can be deleted to revoke one session without needing
// a shared "token version" counter across all of a user's sessions.
export const generateRefreshToken = (): { token: string; expiresAt: Date } => {
  const token = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(
    Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
  );
  return { token, expiresAt };
};
