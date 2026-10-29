import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import settingsRoutes from "./routes/settings.routes";
import catalogRoutes from "./routes/catalog.routes";
import quizRoutes from "./routes/quiz.routes";
import pagesRoutes from "./routes/pages.routes";
import notesRoutes from "./routes/notes.routes";
import paymentsRoutes from "./routes/payments.routes";
import { apiLimiter } from "./middleware/rateLimiter";
import { razorpayWebhook } from "./controllers/payments.controller";
import { globalErrorHandler, notFoundHandler } from "./middleware/error.middleware";
import prisma from "./config/prisma";

// The Express app, without listen() — imported by server.ts and by the API tests.
const app = express();

// Behind nginx/Cloudflare: use the real client IP (rate limits) and scheme (https URLs).
app.set("trust proxy", env.TRUST_PROXY);

const corsOptions = {
  // "*" or an exact allow-list (parsed from the comma-separated env var)
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Authorization"],
};

app.use(helmet());
app.use(cors(corsOptions));
// Razorpay webhook needs the exact raw bytes for its signature, so it is
// registered BEFORE the JSON body parser.
app.post("/api/payments/webhook/razorpay", express.raw({ type: "*/*", limit: "1mb" }), razorpayWebhook);

// 3 MB: bulk question imports (Assamese text is ~3 bytes/char in UTF-8) exceed the 100 kB default.
app.use(express.json({ limit: "3mb" }));

// Whole-API backstop (per IP); each sensitive route adds its own tighter limit.
app.use("/api", apiLimiter);

// Liveness: the process is up.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness: the database answers too (used by the Docker healthcheck).
app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.classLevel.count();
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/content", pagesRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
