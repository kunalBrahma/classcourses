// Creates an ADMIN user, or promotes an existing user to ADMIN.
// Usage: npm run create-admin -- <email> <password> [name]
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

const main = async () => {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run create-admin -- <email> <password> [name]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  const hashed = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, password: hashed, name: name ?? "Admin", role: "ADMIN" },
    update: { password: hashed, role: "ADMIN" },
    select: { id: true, email: true, role: true },
  });
  console.log(`Admin ready: ${user.email} (${user.role})`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
