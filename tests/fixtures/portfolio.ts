import type { Snapshot, Connection } from "../../src/core/model";
import { portfolio } from "../../src/core/portfolio";
export function demo() {
  const now = Date.now();
  const sources = ["zerodha", "angelone", "indmoney"] as const;
  const snapshots: Snapshot[] = sources.map((provider, i) => {
    const asOf = new Date(now - (i === 1 ? 86400_000 : 120_000)).toISOString();
    const accountId = provider + ":sample";
    const rows =
      i === 0
        ? [
            ["RELIANCE", "Reliance Industries", "180", "2850", "2480"],
            ["INFY", "Infosys", "250", "1830", "1520"],
            ["HDFCBANK", "HDFC Bank", "320", "1720", "1610"],
          ]
        : i === 1
          ? [
              ["TCS", "Tata Consultancy Services", "110", "4120", "3650"],
              ["GOLDBEES", "Nippon India Gold ETF", "2800", "64", "52"],
            ]
          : [
              ["AAPL", "Apple", "25", "224", "182"],
              ["MSFT", "Microsoft", "18", "432", "380"],
            ];
    return {
      provider,
      version: "synthetic-v1",
      asOf,
      accounts: [
        {
          id: accountId,
          providerAccountId: "sample",
          currency: i === 2 ? "USD" : "INR",
          type: "brokerage",
        },
      ],
      holdings: rows.map(([ticker, name, q, price, avg]) => ({
        accountId,
        source: provider,
        custodyBroker: provider,
        instrumentId: `sample:${ticker}`,
        ticker,
        name,
        exchange: i === 2 ? "NASDAQ" : "NSE",
        assetClass:
          ticker === "GOLDBEES"
            ? "Gold"
            : i === 2
              ? "US Equity"
              : "Indian Equity",
        country: i === 2 ? "US" : "IN",
        sector: ticker === "GOLDBEES" ? "Commodities" : "Unknown",
        currency: i === 2 ? "USD" : "INR",
        quantity: q,
        averagePrice: avg,
        investedValue: String(Number(q) * Number(avg)),
        marketPrice: price,
        marketValue: String(Number(q) * Number(price)),
        asOf,
        identityVerified: true,
      })),
      positions:
        i === 0
          ? [
              {
                accountId,
                source: provider,
                instrumentId: "sample:NIFTY-FUT",
                ticker: "NIFTY FUT (sample)",
                exchange: "NFO",
                currency: "INR",
                quantity: "-50",
                averagePrice: "25100",
                marketPrice: "25080",
                unrealizedPnL: "1000",
                realizedPnL: "0",
                asOf,
              },
            ]
          : [],
      cash: [],
      transactions: [],
      coverage: {
        holdings: "complete",
        positions: "unavailable",
        cash: "unavailable",
        transactions: "unavailable",
      },
    };
  });
  const connections: Connection[] = sources.map((id, i) => ({
    id,
    status: i === 1 ? "NEEDS_LOGIN" : "CONNECTED",
    connected: true,
    lastSuccessAt: snapshots[i].asOf,
    lastAttemptAt: snapshots[i].asOf,
    errorCode: i === 1 ? "SESSION_EXPIRED" : null,
    generation: 0,
    expiresAt: null,
  }));
  const current = portfolio(snapshots, connections);
  const history = Array.from({ length: 31 }, (_, i) => ({
    day: new Date(now - (30 - i) * 86400_000).toISOString().slice(0, 10),
    ...current,
    totals: current.totals.map((t) => ({
      ...t,
      marketValue: String(Number(t.marketValue) * (0.94 + i * 0.002)),
      totalValue: String(Number(t.totalValue) * (0.94 + i * 0.002)),
    })),
  }));
  return { snapshots, connections, current, history };
}
