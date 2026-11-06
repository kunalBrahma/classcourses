import app from "./app";
import prisma from "./config/prisma";
import { env } from "./config/env";
import { startMaintenance } from "./services/maintenance.service";
import { ensureDefaultDistricts } from "./services/profile.service";

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
});

const stopMaintenance = startMaintenance();

// Sign-up needs districts. Deploys run migrations, not the seed, so a new
// database gets the default list here (only while the table is empty).
ensureDefaultDistricts()
  .then(({ districtsCreated }) => districtsCreated && console.log(`[districts] added ${districtsCreated} default districts`))
  .catch((err) => console.error("[districts] couldn't add the default list:", err));

// Graceful shutdown (docker stop / deploys send SIGTERM): stop taking new
// connections, let in-flight requests (e.g. a payment verify) finish, then
// close the DB pool. Force-exit if something hangs.
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  stopMaintenance();
  const force = setTimeout(() => {
    console.error("Forced exit after 10s");
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
