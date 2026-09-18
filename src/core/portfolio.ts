import Decimal from "decimal.js";
import type { Connection, Holding, Snapshot } from "./model";
const sum = (v: string[]) =>
  v.reduce((a, b) => a.plus(b), new Decimal(0)).toFixed();
export function portfolio(
  snapshots: Snapshot[],
  connections: Connection[],
  now = new Date(),
) {
  const excluded: { holding: Holding; reason: string }[] = [];
  const holdings = snapshots
    .flatMap((s) => s.holdings)
    .filter((h) => {
      const direct = snapshots.filter((s) => s.provider !== "indmoney");
      if (
        h.source === "indmoney" &&
        direct.length > 0 &&
        (direct.some((s) => s.provider === h.custodyBroker) ||
          (h.custodyBroker === "Unknown custody" &&
            direct.some((s) =>
              s.holdings.some((d) => d.currency === h.currency),
            )))
      ) {
        excluded.push({
          holding: h,
          reason:
            "Linked broker observation excluded until underlying account identity is reconciled",
        });
        return false;
      }
      return true;
    });
  const seen = new Set<string>();
  for (const h of holdings) {
    const key = [
      h.source,
      h.accountId,
      h.instrumentId,
      h.exchange,
      h.currency,
    ].join("|");
    if (seen.has(key)) throw new Error("Duplicate canonical holding");
    seen.add(key);
  }
  const currencies = [
    ...new Set([
      ...holdings.map((h) => h.currency),
      ...snapshots.flatMap((s) => s.cash.map((c) => c.currency)),
    ]),
  ];
  const totals = currencies.map((currency) => {
    const rows = holdings.filter((h) => h.currency === currency);
    const invested = rows.every((h) => h.investedValue !== null)
      ? sum(rows.map((h) => h.investedValue!))
      : null;
    const value = sum(rows.map((h) => h.marketValue));
    const knownCash = sum(
      snapshots
        .flatMap((s) => s.cash)
        .filter((c) => c.currency === currency)
        .map((c) => c.available),
    );
    const relevant = snapshots.filter(
      (s) =>
        s.accounts.some((a) => a.currency === currency) ||
        s.holdings.some((h) => h.currency === currency) ||
        s.cash.some((c) => c.currency === currency),
    );
    const cash =
      relevant.length &&
      relevant.every(
        (s) =>
          s.coverage.cash === "complete" &&
          (!s.coverage.cashCurrencies ||
            s.coverage.cashCurrencies.includes(currency)),
      )
        ? knownCash
        : null;
    return {
      currency,
      marketValue: value,
      investedValue: invested,
      unrealizedPnL:
        invested === null ? null : new Decimal(value).minus(invested).toFixed(),
      cash,
      cashEstimated: snapshots.some((s) =>
        s.cash.some((c) => c.currency === currency && c.estimated),
      ),
      totalValue:
        cash === null ? null : new Decimal(value).plus(cash).toFixed(),
    };
  });
  const freshness = connections.map((c) => {
    const snapshot = snapshots.find((s) => s.provider === c.id);
    const lastSync = snapshot?.asOf || null;
    return {
      provider: c.id,
      ownerLabel: c.ownerLabel || "Unlabeled",
      lastSync,
      lastSuccessfulSyncAt: c.lastSuccessAt,
      connectionStatus: c.status,
      status: !lastSync
        ? "unavailable"
        : now.getTime() - Date.parse(lastSync) > 30 * 60_000 ||
            c.status === "ERROR" ||
            c.status === "NEEDS_LOGIN"
          ? "stale"
          : "current",
    };
  });
  return {
    asOf: snapshots.length ? snapshots.map((s) => s.asOf).sort()[0] : null,
    providerScopes: snapshots.map((s) => ({
      provider: s.provider,
      currencyScope: s.currencyScope || "ALL",
    })),
    observationNotes: snapshots.flatMap((s) =>
      s.observationNote ? [s.observationNote] : [],
    ),
    generatedAt: now.toISOString(),
    providers: freshness,
    holdings,
    totals,
    excluded,
    coverage: {
      fx: "Native currency totals; no cross-currency conversion",
      costBasis: holdings.every((h) => h.investedValue !== null)
        ? "complete"
        : "partial",
      cash:
        snapshots.every(
          (s) =>
            s.coverage.cash === "complete" &&
            (!s.coverage.cashCurrencies ||
              s.accounts.every((a) =>
                s.coverage.cashCurrencies!.includes(a.currency),
              )),
        ) && snapshots.length
          ? "complete"
          : "partial",
      transactions:
        snapshots.every((s) => s.coverage.transactions === "complete") &&
        snapshots.length
          ? "complete"
          : "unavailable",
    },
    includesStaleData: freshness.some((p) => p.status === "stale"),
  };
}
export type Portfolio = ReturnType<typeof portfolio>;
export function allocation(p: Portfolio, dimension: string) {
  const keys: Record<string, keyof Holding> = {
    owner: "ownerLabel",
    asset_class: "assetClass",
    broker: "custodyBroker",
    country: "country",
    sector: "sector",
    currency: "currency",
  };
  const key = keys[dimension];
  if (!key) throw new Error("Invalid allocation dimension");
  const groups = new Map<
    string,
    { label: string; currency: string; value: Decimal }
  >();
  for (const h of p.holdings) {
    const label = String(h[key]);
    const id = `${h.currency}:${label}`;
    const g = groups.get(id) || {
      label,
      currency: h.currency,
      value: new Decimal(0),
    };
    g.value = g.value.plus(h.marketValue);
    groups.set(id, g);
  }
  return [...groups.values()].map((g) => {
    const total = p.totals.find((t) => t.currency === g.currency)!.marketValue;
    return {
      label: g.label,
      currency: g.currency,
      value: g.value.toFixed(),
      percentage: new Decimal(total).isZero()
        ? null
        : g.value.div(total).times(100).toFixed(2),
    };
  });
}
