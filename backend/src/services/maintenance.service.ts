import { cancelStaleOrders } from "./order.service";

// In-process housekeeping for a single API instance. Everything here is also
// applied lazily on read, so a missed run only delays it — never breaks it.
//   - unpaid orders older than 30 min are cancelled and their held coins
//     returned, so balances are right even if the student never comes back
const INTERVAL_MS = 5 * 60 * 1000;

export const startMaintenance = () => {
  const run = () =>
    cancelStaleOrders().catch((err) => console.error("[maintenance] cancelStaleOrders failed:", (err as Error).message));
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref(); // never keeps the process alive on shutdown
  void run();
  return () => clearInterval(timer);
};
