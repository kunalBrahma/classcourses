import http from "node:http";
import { afterAll, beforeAll } from "vitest";
import prisma from "../src/config/prisma";
import { clearSettingsCache } from "../src/services/settings.service";

// Each test file starts from an empty database (the dedicated *_test DB).
// supertest starts a short-lived server per request. Node 19+ reuses sockets
// (keep-alive) by default, so a request could land on a socket whose server
// just closed → random "socket hang up" failures. No reuse in tests.
http.globalAgent = new http.Agent({ keepAlive: false });

export const resetDatabase = async () => {
  await prisma.page.deleteMany();
  await prisma.faqItem.deleteMany();
  await prisma.newsLink.deleteMany();
  await prisma.noteAccess.deleteMany();
  await prisma.order.deleteMany();
  await prisma.note.deleteMany();
  await prisma.coinTransaction.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.quizChapter.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.question.deleteMany();
  await prisma.video.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.subjectPart.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.classLevel.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.medium.deleteMany();
  clearSettingsCache();
};

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("Refusing to run tests against a non-test database");
  }
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
