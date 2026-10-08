import "dotenv/config";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/testDatabaseUrl";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // One shared test database → run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl(),
      // Tests control SMTP themselves (local smtp-server); ignore any real SMTP in .env.
      SMTP_HOST: "",
      SMTP_FROM_EMAIL: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      // Payments go to the local fake Razorpay in tests/fakeRazorpay.ts; ignore real keys.
      RAZORPAY_API_BASE: "http://127.0.0.1:4599/v1",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
    },
  },
});
