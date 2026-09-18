import type { Snapshot } from "./model";
export type IndmoneyScope = "ALL" | "USD";
export const usdObservationNote =
  "INDmoney scope: USD investments only. USD wallet cash is unavailable from the verified integration and is not included in totals. Timestamps show retrieval time, not the underlying valuation time.";
export function scopeSnapshots(
  snapshots: Snapshot[],
  scope: IndmoneyScope,
): Snapshot[] {
  return snapshots.map((s) =>
    s.provider !== "indmoney" || scope !== "USD"
      ? s
      : {
          ...s,
          currencyScope: "USD",
          holdings: s.holdings.filter((h) => h.currency === "USD"),
          positions: s.positions.filter((p) => p.currency === "USD"),
          cash: s.cash.filter((c) => c.currency === "USD"),
          accounts: s.accounts.filter((a) => a.currency === "USD"),
          transactions: s.transactions.filter((t) => t.currency === "USD"),
          observationNote: s.cash.some((c) => c.currency === "USD")
            ? s.observationNote
            : usdObservationNote,
        },
  );
}
