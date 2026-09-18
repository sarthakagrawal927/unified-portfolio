import { z } from "zod";
export const providers = ["zerodha", "angelone", "indmoney"] as const;
export const activeProviders = ["zerodha", "indmoney"] as const;
export type ProviderId = (typeof providers)[number];
export type Status = "CONNECTED" | "SYNCING" | "NEEDS_LOGIN" | "ERROR";
const amount = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .refine((v) => v.length < 80);
export const HoldingSchema = z.object({
  ownerLabel: z.string().optional(),
  accountId: z.string().min(1),
  source: z.enum(providers),
  custodyBroker: z.string().min(1),
  instrumentId: z.string().min(1),
  isin: z.string().optional(),
  ticker: z.string().min(1),
  name: z.string().min(1),
  exchange: z.string(),
  assetClass: z.string(),
  country: z.string(),
  sector: z.string().default("Unknown"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  quantity: amount.nullable(),
  averagePrice: amount.nullable(),
  investedValue: amount.nullable(),
  marketPrice: amount.nullable(),
  marketValue: amount,
  asOf: z.string().datetime(),
  identityVerified: z.boolean(),
});
export type Holding = z.infer<typeof HoldingSchema>;
export const PositionSchema = z.object({
  accountId: z.string().min(1),
  source: z.enum(providers),
  instrumentId: z.string().min(1),
  ticker: z.string().min(1),
  exchange: z.string(),
  currency: z.string(),
  quantity: amount,
  averagePrice: amount.nullable(),
  marketPrice: amount.nullable(),
  unrealizedPnL: amount.nullable(),
  realizedPnL: amount.nullable(),
  asOf: z.string().datetime(),
});
export type Position = z.infer<typeof PositionSchema>;
export const SnapshotSchema = z.object({
  provider: z.enum(providers),
  version: z.string(),
  observationNote: z.string().optional(),
  currencyScope: z.enum(["ALL", "USD"]).optional(),
  asOf: z.string().datetime(),
  accounts: z.array(
    z.object({
      id: z.string(),
      providerAccountId: z.string(),
      currency: z.string(),
      type: z.string(),
    }),
  ),
  holdings: z.array(HoldingSchema),
  positions: z.array(PositionSchema),
  cash: z.array(
    z.object({
      accountId: z.string(),
      currency: z.string(),
      available: amount,
      balanceType: z.enum(["available", "wallet"]).optional(),
      estimated: z.boolean().optional(),
      sourceValue: amount.optional(),
      sourceCurrency: z.string().optional(),
      conversionRate: amount.optional(),
      conversionMethod: z.string().optional(),
      asOf: z.string().datetime(),
    }),
  ),
  coverage: z.object({
    holdings: z.literal("complete"),
    positions: z.enum(["complete", "unavailable"]),
    cash: z.enum(["complete", "unavailable"]),
    cashCurrencies: z.array(z.string()).optional(),
    transactions: z.enum(["complete", "unavailable"]),
  }),
  transactions: z.array(
    z.object({
      id: z.string(),
      accountId: z.string(),
      instrumentId: z.string(),
      type: z.string(),
      quantity: amount,
      price: amount,
      charges: amount.nullable(),
      currency: z.string(),
      timestamp: z.string().datetime(),
    }),
  ),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Connection = {
  ownerLabel?: string;
  id: ProviderId;
  status: Status;
  connected: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  errorCode: string | null;
  generation: number;
  expiresAt: string | null;
};
export type Authorization = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountId?: string;
  clientId?: string;
  metadata?: Record<string, unknown>;
};
export class ProviderError extends Error {
  constructor(
    public code: string,
    public needsLogin = false,
    public retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
export interface PortfolioProvider {
  id: ProviderId;
  connect(
    state: string,
    callback: string,
  ): Promise<{ url: string; context?: Record<string, unknown> }>;
  exchange(
    params: URLSearchParams,
    callback: string,
    context: Record<string, unknown>,
  ): Promise<Authorization>;
  refresh(auth: Authorization): Promise<Authorization>;
  fetch(auth: Authorization): Promise<Snapshot>;
}
export const instrumentIdentity = (v: {
  isin?: string;
  exchange: string;
  id?: string;
  ticker: string;
}) =>
  v.isin
    ? `isin:${v.isin.toUpperCase()}`
    : v.id
      ? `${v.exchange}:${v.id}`
      : `${v.exchange}:${v.ticker}`;
export const messages: Record<string, string> = {
  SESSION_EXPIRED:
    "Your session has expired. Reconnect to refresh your investments.",
  NOT_CONFIGURED: "Connection setup is needed on the server.",
  RATE_LIMIT:
    "The provider is busy. Your last portfolio is safe; we will retry later.",
  INVALID_PAYLOAD:
    "The provider returned incomplete data. Your previous portfolio is still available.",
  UPSTREAM_ERROR: "We could not refresh this account. Try again shortly.",
  SYNC_INTERRUPTED: "The previous refresh did not finish. Refresh again.",
  INDMONEY_CONTINUE:
    "Import is progressing across asset categories. Refresh again shortly; completed reads are saved securely.",
  INDMONEY_IMPORT_PENDING:
    "INDmoney is connected. Portfolio import is not ready yet; reconnecting will not fix this. No INDmoney values are included in totals.",
  INDMONEY_SCHEMA:
    "INDmoney’s response needs a verified adapter update. Previous data is preserved.",
  UNKNOWN:
    "Refresh could not finish. Your previous portfolio is still available.",
};
