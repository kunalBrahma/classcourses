// Creates the test database (if missing) and applies all migrations to it.
// Run automatically by `npm test`. Uses TEST_DATABASE_URL, or DATABASE_URL
// with the database name swapped for "<name>_test".
import "dotenv/config";
import { execSync } from "child_process";
import { Client } from "pg";
import { testDatabaseUrl } from "../tests/testDatabaseUrl";

const main = async () => {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);

  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    // Identifier can't be parameterised; dbName comes from our own config, not user input.
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
    console.log(`[test-db] created ${dbName}`);
  }
  await client.end();

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
};

main().catch((err) => {
  console.error("[test-db] failed:", err);
  process.exit(1);
});
