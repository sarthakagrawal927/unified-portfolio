import { usdObservationNote } from "../../core/scope";
import Decimal from "decimal.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { ProviderError, SnapshotSchema, type Holding } from "../../core/model";
export const assetTypes = [
  "IND_STOCK",
  "MF",
  "US_STOCK",
  "BOND",
  "EPF",
  "NPS",
  "SA",
  "FD",
  "CRYPTO",
  "INSURANCE",
  "VEHICLE",
  "RE",
  "RD",
  "AIF",
  "PMS",
  "PPF",
] as const;
export type AssetType = (typeof assetTypes)[number];
const numeric = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((v) => new Decimal(v).toFixed());
const rowSchema = z
  .object({
    investment_code: z.union([z.string(), z.number()]).nullable(),
    investment: z.string().min(1),
    asset_type: z.string(),
    assetclass_l2: z.string().nullable().optional(),
    market_value: numeric,
    invested_amount: z.preprocess(
      (v) => (typeof v === "string" && !/^-?\d+(\.\d+)?$/.test(v) ? null : v),
      numeric.nullable(),
    ),
    total_units: numeric.nullable(),
    unit_price: numeric.nullable(),
    broker: z.string().nullable(),
    current_value_usd: numeric.optional(),
    invested_value_usd: numeric.nullable().optional(),
  })
  .passthrough();
const payloadSchema = z
  .object({
    holdings: z.array(rowSchema),
    holding_error: z.boolean().optional(),
    position_error: z.boolean().optional(),
    is_cached_response: z.boolean().optional(),
  })
  .passthrough();
export function unpack(result: unknown): unknown {
  const r = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.object({ result: z.string() }).optional(),
      content: z
        .array(
          z
            .object({ type: z.string(), text: z.string().optional() })
            .passthrough(),
        )
        .optional(),
    })
    .parse(result);
  if (r.isError) throw new ProviderError("UPSTREAM_ERROR");
  const text =
    r.structuredContent?.result ??
    r.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new ProviderError("INDMONEY_SCHEMA");
  let data = JSON.parse(text);
  if (typeof data?.result === "string") data = JSON.parse(data.result);
  if (data?.error) {
    if (typeof data.retry_after_seconds === "number")
      throw new ProviderError(
        "RATE_LIMIT",
        false,
        Math.max(1, Math.min(86400, data.retry_after_seconds)),
      );
    throw new ProviderError("UPSTREAM_ERROR");
  }
  return data;
}
export type Category = { type: AssetType; data: unknown; asOf: string };
export function normalizeCategory(category: Category): Holding[] {
  const checked = payloadSchema.safeParse(category.data);
  if (!checked.success)
    throw new ProviderError(
      "INVALID_PAYLOAD:" +
        category.type +
        ":" +
        checked.error.issues
          .map((i) => i.path.join(".") + "-" + i.code)
          .slice(0, 3)
          .join(","),
    );
  const p = checked.data;
  if (p.holding_error) throw new ProviderError("INVALID_PAYLOAD");
  const rows = p.holdings.map((r): Holding => {
    // The tool argument is the category code; rows use human-readable asset labels.
    const currency = category.type === "US_STOCK" ? "USD" : "INR";
    const value = currency === "USD" ? r.current_value_usd : r.market_value;
    if (value === undefined) throw new ProviderError("INDMONEY_SCHEMA");
    const invested =
      currency === "USD" ? (r.invested_value_usd ?? null) : r.invested_amount;
    const qty = r.total_units;
    const brokerText = r.broker?.trim() || "Unknown custody";
    const broker = /zerodha|kite/i.test(brokerText)
      ? "zerodha"
      : /angel/i.test(brokerText)
        ? "angelone"
        : brokerText;
    const code = r.investment_code === null ? null : String(r.investment_code);
    const isin =
      code && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code) ? code : undefined;
    // Provider IDs and name hashes are source-scoped observations, never ticker identity.
    const id = isin
      ? `isin:${isin}`
      : `indmoney:${category.type}:${code || createHash("sha256").update(r.investment).digest("hex")}`;
    return {
      accountId: `indmoney:${category.type}:${broker}`,
      source: "indmoney",
      custodyBroker: broker,
      instrumentId: id,
      isin,
      ticker: code || r.investment,
      name: r.investment,
      exchange: "Unknown",
      assetClass: r.assetclass_l2 || category.type,
      country:
        category.type === "US_STOCK"
          ? "US"
          : category.type === "CRYPTO"
            ? "Unknown"
            : "IN",
      sector: "Unknown",
      currency,
      quantity: qty,
      averagePrice:
        qty !== null && !new Decimal(qty).isZero() && invested !== null
          ? new Decimal(invested).div(qty).toFixed()
          : null,
      investedValue: invested,
      marketPrice:
        currency === "USD"
          ? qty !== null && !new Decimal(qty).isZero()
            ? new Decimal(value).div(qty).toFixed()
            : null
          : r.unit_price,
      marketValue: value,
      asOf: category.asOf,
      identityVerified: Boolean(isin),
    };
  });
  // A repeated row may be multiple lots: reject rather than silently double-count or discard.
  const keys = rows.map((r) => r.accountId + "|" + r.instrumentId);
  if (new Set(keys).size !== keys.length)
    throw new ProviderError("INVALID_PAYLOAD");
  return rows;
}
export function normalizeIndmoney(
  categories: Category[],
  requested: readonly AssetType[] = assetTypes,
) {
  if (
    categories.length !== requested.length ||
    new Set(categories.map((c) => c.type)).size !== requested.length ||
    requested.some((t) => !categories.some((c) => c.type === t))
  )
    throw new ProviderError("INVALID_PAYLOAD");
  const holdings = categories.flatMap(normalizeCategory);
  return SnapshotSchema.parse({
    provider: "indmoney",
    version: "networth_holdings-v1",
    currencyScope:
      requested.length === 1 && requested[0] === "US_STOCK" ? "USD" : "ALL",
    asOf: categories.map((c) => c.asOf).sort()[0],
    accounts: [
      ...new Map(
        holdings.map((h) => [
          h.accountId,
          {
            id: h.accountId,
            providerAccountId: h.accountId,
            currency: h.currency,
            type: "aggregated observation",
          },
        ]),
      ).values(),
    ],
    holdings,
    positions: [],
    cash: [],
    transactions: [],
    coverage: {
      holdings: "complete",
      positions: "unavailable",
      cash: "unavailable",
      transactions: "unavailable",
    },
    observationNote:
      requested.length === 1 && requested[0] === "US_STOCK"
        ? usdObservationNote
        : "INDmoney-reported asset values, including externally linked or manually tracked assets. Timestamps show retrieval time; underlying valuation timestamps are not supplied. Savings balances are included as assets. Liabilities and derivative positions are not included.",
  });
}
