import prisma from "../config/prisma";
import { DISTRICTS } from "../content/districts";
import { AppError } from "../utils/AppError";
import { istDayKey } from "../utils/istDate";

// The student profile asked at sign-up and in "complete your profile":
// class, district and date of birth (phone optional). Client requirements of
// 6 Nov 2026. Every rule about these fields lives here.

type Db = Pick<typeof prisma, "district" | "classLevel">;

// ---- Districts --------------------------------------------------------------

// Default districts, added only while the table is EMPTY (first deploy, a new
// database). Never re-adds districts the admin removed. Used by the seed and
// at API start-up, because deploys run migrations, not the seed.
export const ensureDefaultDistricts = async (db: Db = prisma) => {
  if ((await db.district.count()) > 0) return { districtsCreated: 0 };
  const { count } = await db.district.createMany({
    data: DISTRICTS.map((name, order) => ({ name, order })),
    skipDuplicates: true,
  });
  return { districtsCreated: count };
};

// What the sign-up and profile forms offer: active classes and districts.
export const profileOptions = async () => {
  const [classes, districts] = await Promise.all([
    prisma.classLevel.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true, nativeName: true } }),
    prisma.district.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true, nativeName: true } }),
  ]);
  return { classes, districts };
};

// ---- Date of birth ----------------------------------------------------------

export const MIN_AGE_YEARS = 3;
export const ADULT_AGE_YEARS = 18;
const OLDEST_YEAR = 1900;

const pad = (n: number) => String(n).padStart(2, "0");
// Stored as a DATE column: Prisma gives midnight UTC of that day.
export const dateOnly = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Whole years between a birth date and today in India (birthday counts on the day).
export const ageOn = (dateOfBirth: Date, todayKey: string = istDayKey()) => {
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const by = dateOfBirth.getUTCFullYear();
  const bm = dateOfBirth.getUTCMonth() + 1;
  const bd = dateOfBirth.getUTCDate();
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};

// "YYYY-MM-DD" → a real calendar date, not in the future, at least 3 years ago.
export const parseDateOfBirth = (value: string, todayKey: string = istDayKey()): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !date || dateOnly(date) !== value) throw new AppError(400, "Enter a real date of birth");
  if (date.getUTCFullYear() < OLDEST_YEAR) throw new AppError(400, "Please check the year of birth");
  if (value > todayKey) throw new AppError(400, "The date of birth can't be in the future");
  if (ageOn(date, todayKey) < MIN_AGE_YEARS) throw new AppError(400, "Please check the year of birth");
  return date;
};

// ---- Class and district -----------------------------------------------------

export const requireActiveClass = async (classLevelId: string, db: Db = prisma) => {
  const found = await db.classLevel.findFirst({ where: { id: classLevelId, isActive: true }, select: { id: true } });
  if (!found) throw new AppError(400, "Please choose your class");
  return found.id;
};

export const requireActiveDistrict = async (districtId: string, db: Db = prisma) => {
  const found = await db.district.findFirst({ where: { id: districtId, isActive: true }, select: { id: true } });
  if (!found) throw new AppError(400, "Please choose your district");
  return found.id;
};

// ---- Status -----------------------------------------------------------------

export type ProfileField = "classLevel" | "district" | "dateOfBirth";

// Complete = class, district and date of birth are all set. Signed-in students
// with a missing field are sent to "complete your profile" by the site.
export const profileStatus = (u: { classLevelId: string | null; districtId: string | null; dateOfBirth: Date | null }) => {
  const missing: ProfileField[] = [];
  if (!u.classLevelId) missing.push("classLevel");
  if (!u.districtId) missing.push("district");
  if (!u.dateOfBirth) missing.push("dateOfBirth");
  const age = u.dateOfBirth ? ageOn(u.dateOfBirth) : null;
  return {
    profileComplete: missing.length === 0,
    missingProfile: missing,
    dateOfBirth: u.dateOfBirth ? dateOnly(u.dateOfBirth) : null,
    age,
    // null = not known yet (no date of birth)
    isMinor: age === null ? null : age < ADULT_AGE_YEARS,
  };
};
