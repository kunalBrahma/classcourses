// Demo quiz content, for trying the quiz flow before real questions exist.
//   npm run seed:demo              add 50 ready chapter quizzes (+ 2 class tests)
//   npm run seed:demo -- --remove  take every demo question and quiz out again
//
// Each demo chapter gets 12 quiz MCQs (maths generated per chapter, plus
// general knowledge; Assamese-medium chapters get Assamese questions too).
// Demo rows are marked (explanation starts with DEMO_MARK, quiz titles with
// "Demo:") so --remove deletes only them. Never run this on the live site.
import { Difficulty } from "@prisma/client";
import prisma from "../src/config/prisma";
import { env } from "../src/config/env";
import { publicChapterWhere } from "../src/services/catalog.service";

const DEMO_MARK = "Demo question";
const DEMO_QUIZ_PREFIX = "Demo:";
const CHAPTER_TARGET = 50;
const PER_CHAPTER = 12;

interface Mcq {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
}

// Small seeded random so a re-run makes the same questions.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const optionsAround = (answer: number, rand: () => number) => {
  const set = new Set([answer]);
  while (set.size < 4) {
    const delta = Math.floor(rand() * 9) - 4 || 5;
    if (answer + delta >= 0) set.add(answer + delta);
  }
  const options = [...set].sort(() => rand() - 0.5);
  return { options: options.map(String), correctIndex: options.indexOf(answer) };
};

const mathsQuestions = (seed: number, count: number): Mcq[] => {
  const rand = rng(seed);
  const out: Mcq[] = [];
  const asked = new Set<string>();
  while (out.length < count) {
    const kind = out.length % 4;
    const a = 2 + Math.floor(rand() * 18);
    const b = 2 + Math.floor(rand() * 9);
    let question: string;
    let answer: number;
    let difficulty: Difficulty;
    if (kind === 0) {
      question = `What is ${a} + ${b * 3}?`;
      answer = a + b * 3;
      difficulty = "EASY";
    } else if (kind === 1) {
      question = `What is ${a} × ${b}?`;
      answer = a * b;
      difficulty = "MEDIUM";
    } else if (kind === 2) {
      question = `What comes next: ${a}, ${a + b}, ${a + 2 * b}, …?`;
      answer = a + 3 * b;
      difficulty = "MEDIUM";
    } else {
      question = `${a * b} ÷ ${b} = ?`;
      answer = a;
      difficulty = "HARD";
    }
    if (asked.has(question)) continue;
    asked.add(question);
    out.push({ question, ...optionsAround(answer, rand), explanation: `${DEMO_MARK}: the answer is ${answer}.`, difficulty });
  }
  return out;
};

const fact = (question: string, options: string[], correctIndex: number, difficulty: Difficulty = "EASY"): Mcq => ({
  question,
  options,
  correctIndex,
  explanation: `${DEMO_MARK}: ${options[correctIndex]}.`,
  difficulty,
});

const GENERAL: Mcq[] = [
  fact("What is the capital of Assam?", ["Guwahati", "Dispur", "Jorhat", "Tezpur"], 1),
  fact("Which is the biggest river of Assam?", ["Barak", "Ganga", "Brahmaputra", "Subansiri"], 2),
  fact("Kaziranga National Park is famous for which animal?", ["Tiger", "One-horned rhino", "Elephant", "Lion"], 1),
  fact("Which festival marks the Assamese New Year?", ["Rongali Bihu", "Diwali", "Holi", "Durga Puja"], 0),
  fact("How many days are there in a week?", ["5", "6", "7", "8"], 2),
  fact("Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Saturn"], 1),
  fact("What do plants need from the air to make food?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], 2, "MEDIUM"),
  fact("Water boils at what temperature (at sea level)?", ["50 °C", "90 °C", "100 °C", "120 °C"], 2),
  fact("Who wrote India's national anthem?", ["Rabindranath Tagore", "Bankim Chandra", "Jyoti Prasad Agarwala", "Sarojini Naidu"], 0, "MEDIUM"),
  fact("Majuli is famous as a…", ["Mountain", "River island", "Desert", "Lake"], 1, "MEDIUM"),
  fact("How many sides does a hexagon have?", ["5", "6", "7", "8"], 1),
  fact("Which is the largest ocean on Earth?", ["Atlantic", "Indian", "Arctic", "Pacific"], 3),
  fact("Which gas do we breathe in to stay alive?", ["Oxygen", "Carbon dioxide", "Hydrogen", "Nitrogen"], 0),
  fact("Assam is famous all over the world for its…", ["Coffee", "Tea", "Cotton", "Wheat"], 1),
  fact("Who was the first Prime Minister of India?", ["Mahatma Gandhi", "Jawaharlal Nehru", "Sardar Patel", "Rajendra Prasad"], 1, "MEDIUM"),
  fact("Which organ pumps blood around the body?", ["Lungs", "Liver", "Heart", "Kidney"], 2),
  fact("Sattriya is a classical dance form from which state?", ["Kerala", "Odisha", "Assam", "Manipur"], 2, "MEDIUM"),
  fact("What is the opposite of 'ancient'?", ["Old", "Modern", "Early", "Past"], 1),
  fact("Which is a noun in: 'The cat sleeps'?", ["The", "cat", "sleeps", "none"], 1, "MEDIUM"),
  fact("Light travels fastest through…", ["Water", "Glass", "Air", "Vacuum"], 3, "HARD"),
  fact("How many states does India have?", ["26", "28", "29", "30"], 1, "HARD"),
  fact("Which hill station is called the 'Scotland of the East'?", ["Shillong", "Darjeeling", "Ooty", "Haflong"], 0, "HARD"),
  fact("The Sun rises in the…", ["West", "North", "East", "South"], 2),
  fact("Which instrument measures temperature?", ["Barometer", "Thermometer", "Speedometer", "Ruler"], 1),
];

const ASSAMESE: Mcq[] = [
  fact("অসমৰ ৰাজধানী কি?", ["গুৱাহাটী", "দিশপুৰ", "যোৰহাট", "তেজপুৰ"], 1),
  fact("অসমৰ আটাইতকৈ ডাঙৰ নদীখন কি?", ["বৰাক", "ব্ৰহ্মপুত্ৰ", "সুবনশিৰি", "ধনশিৰি"], 1),
  fact("ৰঙালী বিহু কোন মাহত পালন কৰা হয়?", ["মাঘ", "বহাগ", "কাতি", "আহিন"], 1),
  fact("কাজিৰঙা কিহৰ বাবে বিখ্যাত?", ["বাঘ", "এশিঙা গঁড়", "হাতী", "সিংহ"], 1),
  fact("এসপ্তাহত কেইদিন থাকে?", ["৫", "৬", "৭", "৮"], 2),
  fact("মাজুলী কি?", ["পাহাৰ", "নদী দ্বীপ", "মৰুভূমি", "হ্ৰদ"], 1, "MEDIUM"),
];

// Picks 12 questions for one chapter: maths first, then rotating facts.
const questionsFor = (index: number, assamese: boolean): Mcq[] => {
  const facts = assamese ? [...ASSAMESE, ...GENERAL] : GENERAL;
  const factCount = 5;
  const picked = Array.from({ length: factCount }, (_, i) => facts[(index * factCount + i) % facts.length]);
  return [...mathsQuestions(1000 + index, PER_CHAPTER - factCount), ...picked];
};

const remove = async () => {
  const quizzes = await prisma.quiz.deleteMany({ where: { title: { startsWith: DEMO_QUIZ_PREFIX } } });
  const questions = await prisma.question.deleteMany({ where: { explanation: { startsWith: DEMO_MARK } } });
  console.log(`Removed ${questions.count} demo questions and ${quizzes.count} demo quizzes.`);
};

const add = async () => {
  // Chapter 1 of the first subject of every class (in every medium), then of
  // the second subject of every class, … so each class gets several subjects.
  const subjects = await prisma.subject.findMany({
    where: { isActive: true, medium: { isActive: true }, classLevel: { isActive: true }, chapters: { some: publicChapterWhere } },
    orderBy: [{ medium: { order: "asc" } }, { classLevel: { order: "asc" } }, { order: "asc" }],
    select: { id: true, mediumId: true, classLevelId: true, medium: { select: { slug: true } } },
  });
  const byClass = new Map<string, typeof subjects>();
  for (const s of subjects) {
    const key = `${s.mediumId}:${s.classLevelId}`;
    byClass.set(key, [...(byClass.get(key) ?? []), s]);
  }
  const classes = [...byClass.values()];

  const chosen: { id: string; assamese: boolean; mediumId: string; classLevelId: string }[] = [];
  for (let round = 0; chosen.length < CHAPTER_TARGET && classes.some((c) => c.length > round); round++) {
    for (const list of classes) {
      const s = list[round];
      if (!s || chosen.length >= CHAPTER_TARGET) continue;
      const chapter = await prisma.chapter.findFirst({ where: { ...publicChapterWhere, subjectId: s.id }, orderBy: [{ number: "asc" }, { order: "asc" }], select: { id: true } });
      if (chapter) chosen.push({ id: chapter.id, assamese: s.medium.slug.startsWith("assamese"), mediumId: s.mediumId, classLevelId: s.classLevelId });
    }
  }

  let added = 0;
  for (const [i, chapter] of chosen.entries()) {
    const existing = await prisma.question.count({ where: { chapterId: chapter.id, explanation: { startsWith: DEMO_MARK } } });
    if (existing > 0) continue;
    const last = await prisma.question.findFirst({ where: { chapterId: chapter.id, kind: "MCQ", source: "EXTRA" }, orderBy: { order: "desc" }, select: { order: true } });
    await prisma.question.createMany({
      data: questionsFor(i, chapter.assamese).map((q, n) => ({
        chapterId: chapter.id,
        kind: "MCQ" as const,
        source: "EXTRA" as const,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: q.difficulty,
        order: (last?.order ?? -1) + 1 + n,
        useInQuiz: true,
      })),
    });
    added++;
  }

  // Two class tests (custom quizzes over every demo chapter of one class).
  const chosenByClass = new Map<string, typeof chosen>();
  for (const c of chosen) chosenByClass.set(`${c.mediumId}:${c.classLevelId}`, [...(chosenByClass.get(`${c.mediumId}:${c.classLevelId}`) ?? []), c]);
  let tests = 0;
  // The two highest classes with demo chapters (board-exam years matter most).
  for (const group of [...chosenByClass.values()].filter((g) => g.length >= 2).slice(-2)) {
    const { mediumId, classLevelId } = group[0];
    const classLevel = await prisma.classLevel.findUniqueOrThrow({ where: { id: classLevelId }, select: { name: true } });
    const title = `${DEMO_QUIZ_PREFIX} ${classLevel.name} practice test`;
    if (await prisma.quiz.findFirst({ where: { title, mediumId, classLevelId } })) continue;
    await prisma.quiz.create({
      data: {
        title,
        description: "Questions from several chapters. Demo content.",
        mediumId,
        classLevelId,
        pickMode: "RANDOM",
        questionCount: 10,
        isPublished: true,
        chapters: { create: group.map((c) => ({ chapterId: c.id })) },
      },
    });
    tests++;
  }

  console.log(`Demo quizzes ready: ${chosen.length} chapters (${added} newly filled, ${PER_CHAPTER} MCQs each) and ${tests} new class tests.`);
};

(async () => {
  if (env.NODE_ENV === "production") throw new Error("Demo content is for development only.");
  if (process.argv.includes("--remove")) await remove();
  else await add();
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
