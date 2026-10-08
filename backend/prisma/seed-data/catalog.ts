// Catalog seed data — see plan.md Appendix A (English Medium, from the client's
// requirements PDF) and Appendix B (Assamese Medium, from the client's
// dailyassam.com screenshot). Chapter names are PENDING from the client, so
// chapters are placeholders ("Chapter 1..N") the admin renames later.

export interface PartSeed {
  title: string;
  chapters: number;
}

export interface SubjectSeed {
  name: string;
  nativeName?: string;
  // Chapters not inside any part (listed first in reading order)
  chapters?: number;
  parts?: PartSeed[];
}

export interface MediumSeed {
  name: string;
  nativeName: string;
  slug: string;
  classes: Record<number, SubjectSeed[]>;
}

const parts = (prefix: string, counts: number[]): PartSeed[] =>
  counts.map((chapters, i) => ({ title: `${prefix} ${i + 1}`, chapters }));

// ---------------------------------------------------------------------------
// English Medium — requirements PDF, Classes 2–12 (chapter counts CONFIRMED)
// ---------------------------------------------------------------------------
export const englishMedium: MediumSeed = {
  name: "English Medium",
  nativeName: "ইংৰাজী মাধ্যম",
  slug: "english-medium",
  classes: {
    2: [
      { name: "Assamese", chapters: 10 },
      { name: "English", chapters: 18 },
      { name: "Math", chapters: 15 },
    ],
    3: [
      // "10 parts, each part has only 2 lessons"
      { name: "Assamese", parts: parts("Part", Array(10).fill(2)) },
      { name: "English", chapters: 6 },
      { name: "Math", parts: parts("Part", [4, 2, 4, 4]) },
    ],
    4: [
      { name: "Assamese", chapters: 20 },
      { name: "English", chapters: 9 },
      { name: "Math", chapters: 17 },
      { name: "Environment", parts: parts("Part", [2, 2, 2, 2, 4]) },
    ],
    5: [
      { name: "Assamese", chapters: 14 },
      { name: "English", chapters: 8 },
      { name: "Math", chapters: 14 },
      { name: "Environment", chapters: 16 },
    ],
    6: [
      { name: "Assamese", chapters: 15 },
      { name: "English", chapters: 8 },
      { name: "Social Science", chapters: 15 },
      { name: "General Science", chapters: 13 },
      { name: "Math", chapters: 10 },
      { name: "Hindi", chapters: 16 },
      { name: "Charitra", chapters: 14 },
    ],
    7: [
      { name: "Assamese", chapters: 15 },
      { name: "English", chapters: 18 },
      { name: "Social Science", chapters: 15 },
      { name: "General Science", chapters: 6 },
      { name: "Math", chapters: 8 },
      { name: "Hindi", chapters: 16 },
      { name: "IT", chapters: 7 },
    ],
    8: [
      { name: "Assamese", chapters: 15 },
      { name: "English", chapters: 8 },
      { name: "Social Science", chapters: 25 },
      { name: "General Science", chapters: 18 },
      { name: "Math", chapters: 16 },
      { name: "Hindi", chapters: 14 },
      { name: "IT", chapters: 9 },
    ],
    9: [
      { name: "Assamese", chapters: 16 },
      { name: "English", chapters: 12 },
      { name: "Social Science", chapters: 13 },
      { name: "General Science", chapters: 15 },
      { name: "Math", chapters: 13 },
      { name: "Hindi", chapters: 16 },
      { name: "Geography", chapters: 8 },
    ],
    10: [
      { name: "Assamese", chapters: 16 },
      { name: "English", chapters: 12 },
      { name: "Social Science", chapters: 13 },
      { name: "General Science", chapters: 16 },
      { name: "Math", chapters: 14 },
      { name: "Hindi", chapters: 12 },
      { name: "English Grammar", chapters: 15 },
      { name: "Hindi Grammar", chapters: 15 },
    ],
    11: [
      { name: "Assamese", chapters: 16 },
      { name: "Advance Assamese", chapters: 11 },
      // "Writing Skills is listed with English; show it as a separate section under English."
      // PENDING: whether the 14 already includes the 6 (task.md #19).
      { name: "English", chapters: 14, parts: [{ title: "Writing Skills", chapters: 6 }] },
      { name: "Education", chapters: 7 },
      { name: "Economics", chapters: 5 },
      { name: "Geography", chapters: 7 },
      { name: "History", chapters: 11 },
      { name: "Logic and Philosophy", chapters: 15 },
      { name: "Political Science", chapters: 20 },
    ],
    12: [
      { name: "Assamese", chapters: 18 },
      { name: "English", chapters: 15 },
      { name: "History", chapters: 16 },
      { name: "Economics", chapters: 6 },
      { name: "Advance Assamese", chapters: 11 },
      { name: "Logic and Philosophy", chapters: 8 },
      { name: "Education", chapters: 7 },
      { name: "Political Science", parts: parts("Book", [10, 9]) },
      { name: "Geography", parts: parts("Part", [1, 3, 5, 1, 3, 1, 5, 3, 2, 2, 2]) },
    ],
  },
};

// ---------------------------------------------------------------------------
// Assamese Medium — client's screenshot, Classes 1–12.
// Chapter counts PENDING (task.md #16) → subjects only, no chapters.
// Names read from a low-resolution screenshot; spellings to be checked (#20).
// ---------------------------------------------------------------------------
const as = (name: string, nativeName: string): SubjectSeed => ({ name, nativeName });

const A = {
  assamese: as("Assamese", "অসমীয়া"),
  advAssamese: as("Advance Assamese", "উচ্চ অসমীয়া"),
  english: as("English", "ইংৰাজী"),
  maths: as("Mathematics", "গণিত"),
  genMaths: as("General Mathematics", "গণিত"),
  evs: as("Environmental Studies", "পৰিৱেশ অধ্যয়ন"),
  science: as("General Science", "বিজ্ঞান"),
  social: as("Social Science", "সমাজ বিজ্ঞান"),
  hindi: as("Hindi", "হিন্দী"),
  history: as("History", "ইতিহাস"),
  geography: as("Geography", "ভূগোল"),
  computer: as("Computer", "কম্পিউটাৰ"),
  computerScience: as("Computer Science", "কম্পিউটাৰ বিজ্ঞান"),
  homeScience: as("Home Science", "গৃহ বিজ্ঞান"),
  tourism: as("Travel Tourism and Hospitality", "পৰ্যটন আৰু আতিথ্য"),
  advMaths: as("Advanced Mathematics", "উচ্চ গণিত"),
  commerce: as("Commerce", "বাণিজ্য"),
  economics: as("Economics", "অৰ্থনীতি"),
};

const seniorSecondary = (withEnvironmentalScience: boolean): SubjectSeed[] => [
  A.assamese,
  A.advAssamese,
  A.english,
  A.hindi,
  as("Swadesh Adhyayan", "স্বদেশ অধ্যয়ন"),
  as("Bihu", "বিহু"),
  as("Logic and Philosophy", "যুক্তি আৰু দৰ্শন"),
  as("Education", "শিক্ষা"),
  as("Political Science", "ৰাজনীতি বিজ্ঞান"),
  as("Sociology", "সমাজ তত্ত্ব"),
  A.geography,
  A.history,
  A.economics,
  ...(withEnvironmentalScience ? [as("Environmental Science", "পৰিৱেশ বিজ্ঞান")] : []),
  as("Biology", "জীৱ বিজ্ঞান"),
  as("Physics", "পদাৰ্থ বিজ্ঞান"),
  as("Chemistry", "ৰসায়ন বিজ্ঞান"),
  A.maths,
  as("Anthropology", "নৃতত্ত্ব"),
  as("Business Studies", "ব্যৱসায় অধ্যয়ন"),
  as("Accountancy", "হিচাপশাস্ত্ৰ"),
  as("Finance", "বিত্ত"),
  A.computerScience,
];

export const assameseMedium: MediumSeed = {
  name: "Assamese Medium",
  nativeName: "অসমীয়া মাধ্যম",
  slug: "assamese-medium",
  classes: {
    1: [A.assamese, A.english, A.maths],
    2: [A.assamese, A.english, A.maths],
    3: [A.assamese, A.english, A.evs, A.maths],
    4: [A.assamese, A.english, A.evs, A.maths],
    5: [A.assamese, A.english, A.evs, A.maths],
    6: [
      A.assamese,
      A.english,
      A.science,
      A.social,
      A.genMaths,
      A.hindi,
      as("Charitra Path", "চৰিত্ৰ পাঠ"),
      as("History of Assam", "অসমৰ ইতিহাস"),
      A.computer,
    ],
    7: [A.assamese, A.english, A.science, A.social, A.genMaths, A.hindi, A.history],
    8: [A.assamese, A.english, A.science, A.social, A.genMaths, A.hindi],
    // (E) = elective in the screenshot
    9: [
      A.assamese,
      A.english,
      A.science,
      A.social,
      A.genMaths,
      A.hindi,
      A.geography,
      A.history,
      as("Yoga", "যোগ শিক্ষা"),
      A.commerce,
      A.homeScience,
      A.tourism,
      A.advMaths,
      A.computerScience,
    ],
    10: [
      A.assamese,
      A.english,
      A.science,
      A.social,
      A.genMaths,
      A.hindi,
      A.geography,
      A.history,
      A.homeScience,
      A.tourism,
      A.advMaths,
      A.computerScience,
      A.commerce,
    ],
    11: seniorSecondary(true),
    12: seniorSecondary(false),
  },
};

// Order = display order of mediums (Assamese first: the site's main audience).
export const MEDIUMS: MediumSeed[] = [assameseMedium, englishMedium];
