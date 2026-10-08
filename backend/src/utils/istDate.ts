// India has no daylight saving: IST is always UTC+05:30. The quiz "day"
// (daily limit, paused-quiz expiry) runs midnight to midnight IST.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// "YYYY-MM-DD" of the IST calendar day containing `date`.
export const istDayKey = (date: Date = new Date()): string =>
  new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// The instant the IST day `dayKey` ends (next IST midnight), as a UTC Date.
export const istDayEnd = (dayKey: string): Date => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - IST_OFFSET_MS);
};
