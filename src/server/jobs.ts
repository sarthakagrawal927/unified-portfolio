import { adapters } from "../providers";
import { sync } from "../core/sync";
import { portfolio } from "../core/portfolio";
import { connectionList, activeSnapshots, dailySnapshot } from "../db/store";
import { usersForSync, cleanupExpired } from "../db/store";
import { withUser } from "./tenant";
export async function runScheduledSync() {
  const users = await usersForSync();
  for (const userId of users)
    await withUser(userId, async () => {
      const connections = await connectionList();
      for (const c of connections) {
        if (
          c.id in adapters &&
          c.connected &&
          c.status !== "NEEDS_LOGIN" &&
          (!c.lastAttemptAt ||
            Date.now() - Date.parse(c.lastAttemptAt) >= 15 * 60_000)
        )
          await sync(adapters[c.id as keyof typeof adapters]);
      }
      const now = new Date();
      const india = new Date(now.getTime() + 330 * 60_000);
      if (india.getUTCHours() >= 17) {
        const data = portfolio(await activeSnapshots(), await connectionList());
        if (data.asOf)
          await dailySnapshot(india.toISOString().slice(0, 10), data);
      }
    });
  await cleanupExpired();
}
