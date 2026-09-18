import { z } from "zod";
import type { Snapshot } from "../../core/model";
const segment = z.object({
  enabled: z.boolean(),
  available: z.object({ live_balance: z.number().finite() }),
});
export function kiteCash(
  data: unknown,
  accountId: string,
  asOf: string,
): Snapshot["cash"] {
  const margins = z.object({ equity: segment, commodity: segment }).parse(data);
  return Object.entries(margins)
    .filter(([, value]) => value.enabled)
    .map(([name, value]) => ({
      accountId: `${accountId}:${name}`,
      currency: "INR",
      available: String(value.available.live_balance),
      balanceType: "available",
      asOf,
    }));
}
