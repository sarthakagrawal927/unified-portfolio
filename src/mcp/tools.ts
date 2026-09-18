import { withUser } from "../server/tenant";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Decimal from "decimal.js";
import { data } from "../server/data";
import { allocation } from "../core/portfolio";
export const toolNames = [
  "portfolio_summary",
  "get_holdings",
  "get_holding",
  "get_allocation",
  "get_portfolio_history",
  "get_performance",
  "get_transactions",
  "get_connection_status",
] as const;
export const serverInstructions =
  "For portfolio answers, read the latest successfully stored data and state each provider's exact lastSync time. Never describe stale data as current. If a provider needs login, explain that its retained values are last known observations. Repeating a read is safe and returns the newest stored snapshot; never imply that an MCP read refreshes a broker.";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export function createMcp(user: string) {
  const server = new McpServer(
    { name: "Unified Portfolio", version: "0.1.0" },
    { instructions: serverInstructions },
  );
  const register = (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    run: (
      args: Record<string, any>,
      d: Awaited<ReturnType<typeof data>>,
    ) => unknown,
  ) => {
    const ownerScoped = [
      "portfolio_summary",
      "get_holdings",
      "get_holding",
      "get_allocation",
      "get_connection_status",
    ].includes(name);
    server.registerTool(
      name,
      {
        description,
        inputSchema: ownerScoped
          ? {
              ...schema,
              owner_label: z
                .string()
                .trim()
                .min(1)
                .max(40)
                .optional()
                .describe(
                  "Filter by the saved portfolio owner label, such as Mine. Omit for your complete portfolio.",
                ),
            }
          : schema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args) => {
        try {
          const d = await withUser(user, () =>
            data(
              ownerScoped
                ? (args.owner_label as string | undefined)
                : undefined,
            ),
          );
          const result = {
            asOf: d.current.asOf,
            retrievedAt: d.current.generatedAt,
            dataState: d.current.includesStaleData
              ? "latest_stored"
              : "current",
            providers: d.current.providers,
            coverage: d.current.coverage,
            ownerLabelFilter: ownerScoped ? args.owner_label || null : null,
            observationNotes: d.current.observationNotes,
            providerScopes: d.current.providerScopes,
            data: run(args, d),
          };
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch {
          const result = {
            asOf: null,
            providers: [],
            error:
              "Portfolio data could not be read. Try again later; stored observations are unchanged.",
          };
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        }
      },
    );
  };
  register(
    "portfolio_summary",
    "Read the latest successfully stored portfolio. Returns exact provider freshness, value and unrealized P&L by native currency; stale values, cash and cost basis coverage are explicit. Call again whenever the user asks to resend or refresh the MCP view.",
    {},
    (_, d) => ({
      totals: d.current.totals,
      cashBalances: d.snapshots.flatMap((s) =>
        s.cash.map((c) => ({
          ...c,
          provider: s.provider,
          ownerLabel: d.connections.find((p) => p.id === s.provider)
            ?.ownerLabel,
        })),
      ),
      openPositions: d.snapshots.flatMap((s) => s.positions),
      positionsIncludedInHoldingsValue: false,
      allocation: allocation(d.current, "asset_class"),
      excludedObservations: d.current.excluded.length,
      includesStaleData: d.current.includesStaleData,
    }),
  );
  register(
    "get_holdings",
    "Latest successfully stored canonical holdings with per-row observation timestamps, excluding unresolved duplicated broker observations.",
    {
      broker: z.string().optional(),
      asset_class: z.string().optional(),
      country: z.string().optional(),
    },
    (a, d) =>
      d.current.holdings.filter(
        (h) =>
          (!a.broker || h.custodyBroker === a.broker) &&
          (!a.asset_class || h.assetClass === a.asset_class) &&
          (!a.country || h.country === a.country),
      ),
  );
  register(
    "get_holding",
    "Find all matching instruments across brokers. A symbol can be ambiguous; inspect ISIN and exchange.",
    { symbol: z.string().min(1).max(100) },
    (a, d) =>
      d.current.holdings.filter((h) =>
        [h.ticker, h.isin, h.instrumentId].some(
          (v) => v?.toUpperCase() === a.symbol.toUpperCase(),
        ),
      ),
  );
  register(
    "get_allocation",
    "Holdings allocation by dimension, separately per currency; cash is reported separately in summary.",
    {
      dimension: z.enum([
        "owner",
        "asset_class",
        "broker",
        "country",
        "sector",
        "currency",
      ]),
    },
    (a, d) => allocation(d.current, a.dimension),
  );
  register(
    "get_portfolio_history",
    "Combined-owner daily observed portfolio snapshots. Owner-specific historical returns are not available. No reconstructed history.",
    { start: date, end: date },
    (a, d) => {
      if (a.start > a.end) throw new Error("Start must precede end");
      return d.history.filter((h) => h.day >= a.start && h.day <= a.end);
    },
  );
  register(
    "get_performance",
    "Combined-owner observed market value change, not investment return. Cash flow history is insufficient for true returns.",
    { period: z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"]) },
    (a, d) => {
      const days: Record<string, number> = {
        "1D": 1,
        "1W": 7,
        "1M": 30,
        "3M": 90,
        "1Y": 365,
        ALL: 365000,
      };
      const start = new Date(Date.now() - days[a.period] * 86400_000)
        .toISOString()
        .slice(0, 10);
      const rows = d.history.filter((h) => h.day >= start);
      const first = rows[0],
        last = rows.at(-1);
      return {
        investmentReturn: null,
        reason: "Insufficient verified cash-flow history",
        marketValueChange:
          rows.length < 2
            ? null
            : last!.totals.map((t) => {
                const old = first.totals.find((f) => f.currency === t.currency);
                return {
                  currency: t.currency,
                  value: old
                    ? new Decimal(t.marketValue)
                        .minus(old.marketValue)
                        .toFixed()
                    : null,
                };
              }),
        observedStart: first?.day || null,
        observedEnd: last?.day || null,
      };
    },
  );
  register(
    "get_transactions",
    "Available verified transactions. Unavailable coverage is not an empty trading history.",
    {
      start: date.optional(),
      end: date.optional(),
      symbol: z.string().optional(),
    },
    (a, d) => ({
      coverage: d.current.coverage.transactions,
      transactions: d.snapshots
        .flatMap((s) => s.transactions)
        .filter(
          (t) =>
            (!a.start || t.timestamp.slice(0, 10) >= a.start) &&
            (!a.end || t.timestamp.slice(0, 10) <= a.end) &&
            (!a.symbol ||
              d.current.holdings.some(
                (h) =>
                  h.instrumentId === t.instrumentId && h.ticker === a.symbol,
              )),
        ),
    }),
  );
  register(
    "get_connection_status",
    "Connection state and freshness for every provider.",
    {},
    (_, d) => d.connections.map(({ generation, ...c }) => c),
  );
  return server;
}
