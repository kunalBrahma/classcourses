import { OAuth2Client } from "google-auth-library";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

// "Continue with Google": the browser gets a signed ID token from Google and sends
// it here. We check Google's signature, issuer, expiry and that it was issued for
// OUR client ID. Nothing the browser says is trusted beyond that token.
const client = new OAuth2Client();

const verifiedGoogleProfile = async (credential: string) => {
  const audience = env.GOOGLE_CLIENT_ID;
  if (!audience) throw new AppError(503, "Google sign-in isn't available right now. Please use your email and password.");

  let payload;
  try {
    payload = (await client.verifyIdToken({ idToken: credential, audience })).getPayload();
  } catch {
    throw new AppError(401, "Google sign-in failed. Please try again.");
  }
  // Google must vouch for the address, because it is what links existing accounts.
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError(401, "Your Google account's email isn't verified. Please use your email and password.");
  }
  return { googleId: payload.sub, email: payload.email.toLowerCase(), name: payload.name?.trim().slice(0, 80) || null };
};

// Admins keep their password: the admin panel has no Google sign-in, and an admin
// session shouldn't start from the student site.
const refuseAdmin = (user: { role: string }) => {
  if (user.role === "ADMIN") throw new AppError(403, "Admin accounts sign in with their password.");
};

export const signInWithGoogle = async (credential: string) => {
  const profile = await verifiedGoogleProfile(credential);

  const linked = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
  if (linked) {
    refuseAdmin(linked);
    return linked;
  }

  // Emails were stored as typed, so match without case. A verified account wins
  // over an unverified one with the same address in another case.
  const existing = await prisma.user.findFirst({
    where: { email: { equals: profile.email, mode: "insensitive" } },
    orderBy: { emailVerified: "desc" },
  });

  if (existing) {
    refuseAdmin(existing);
    // Nobody proved they owned this address when it signed up, and now its real
    // owner has. Whoever set that password could be someone else, so it goes.
    if (!existing.emailVerified) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { googleId: profile.googleId, emailVerified: true, password: null, phone: null, name: profile.name ?? existing.name },
      });
    }
    return prisma.user.update({ where: { id: existing.id }, data: { googleId: profile.googleId } });
  }

  try {
    return await prisma.user.create({ data: { ...profile, emailVerified: true } });
  } catch (err) {
    // A double tap: the other request just created this account.
    if ((err as { code?: string }).code !== "P2002") throw err;
    const created = await prisma.user.findUnique({ where: { googleId: profile.googleId } });
    if (!created) throw err;
    return created;
  }
};
