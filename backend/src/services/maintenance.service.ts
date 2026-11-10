import { cancelStaleOrders, syncPendingRefunds } from "./order.service";
import { pruneLoginThrottles } from "./loginThrottle.service";
import { expireAllDueCoins } from "./coin.service";

// In-process housekeeping for a single API instance. Everything here is also
// applied lazily on read, so a missed run only delays it — never breaks it.
//   - unpaid orders older than 30 min are cancelled and their held coins
//     returned, so balances are right even if the student never comes back
//   - refunds still waiting for Cashfree are checked (in case a webhook was missed)
//   - coins past their 90 days are expired (also done before any read/spend)
//   - failed sign-in counters with no failure for a day and no running pause
//     are deleted (they'd be forgotten on the next failure anyway)
const INTERVAL_MS = 5 * 60 * 1000;

export const startMaintenance = () => {
  const run = () =>
    Promise.all([
      cancelStaleOrders().catch((err) => console.error("[maintenance] cancelStaleOrders failed:", (err as Error).message)),
      syncPendingRefunds().catch((err) => console.error("[maintenance] syncPendingRefunds failed:", (err as Error).message)),
      expireAllDueCoins().catch((err) => console.error("[maintenance] expireAllDueCoins failed:", (err as Error).message)),
      pruneLoginThrottles().catch((err) => console.error("[maintenance] pruneLoginThrottles failed:", (err as Error).message)),
    ]);
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref(); // never keeps the process alive on shutdown
  void run();
  return () => clearInterval(timer);
};
