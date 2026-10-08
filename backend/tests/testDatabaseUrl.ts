// Test runs never touch the dev database.
export const testDatabaseUrl = () => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL or TEST_DATABASE_URL must be set");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/_test$/, "")}_test`;
  return url.toString();
};
