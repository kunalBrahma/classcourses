import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { verifyAccessToken } from "../utils/jwt";
import { accountProblem } from "../services/account.service";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

// The account behind a valid token must still be allowed in: not suspended,
// blocked or deleted (client requirements of 6 Nov 2026), and the token not
// from before "sign out everywhere" (tokenVersion). One primary-key read per
// request, so an admin's action applies at once rather than at token expiry.
const checkAccount = async (userId: string, tokenVersion: number) => {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, suspendedUntil: true, statusReason: true, tokenVersion: true },
  });
  if (!account || account.tokenVersion !== tokenVersion) return { status: 401, body: { error: "Invalid or expired token" } };
  const problem = accountProblem(account);
  if (problem) return { status: problem.statusCode, body: { error: problem.message, code: problem.code, ...(problem.details ?? {}) } };
  return null;
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  let decoded;
  try {
    decoded = verifyAccessToken(authHeader.substring(7));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    const refused = await checkAccount(decoded.userId, decoded.tv ?? 0);
    if (refused) return res.status(refused.status).json(refused.body);
  } catch (err) {
    return next(err);
  }
  req.user = { userId: decoded.userId, email: decoded.email };
  next();
};

// For public routes that show extra info to logged-in users (e.g. "owned").
// A missing, invalid or no-longer-allowed token just means anonymous — never a 401.
export const optionalAuthenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = verifyAccessToken(authHeader.substring(7));
      if (!(await checkAccount(decoded.userId, decoded.tv ?? 0))) req.user = { userId: decoded.userId, email: decoded.email };
    } catch {
      // anonymous
    }
  }
  next();
};
