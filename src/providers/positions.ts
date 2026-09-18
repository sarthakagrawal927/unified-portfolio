import { z } from "zod";
import {
  instrumentIdentity,
  type Position,
  type ProviderId,
} from "../core/model";
const numeric = z
  .union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform(String);
const row = z.object({
  tradingsymbol: z.string(),
  exchange: z.string(),
  instrument_token: z.number().optional(),
  symboltoken: z.string().optional(),
  quantity: numeric.optional(),
  netqty: numeric.optional(),
  average_price: numeric.optional(),
  avgnetprice: numeric.optional(),
  last_price: numeric.optional(),
  ltp: numeric.optional(),
  unrealised: numeric.nullish(),
  realised: numeric.nullish(),
});
export function normalizePositions(
  raw: unknown,
  source: ProviderId,
  accountId: string,
  asOf: string,
): Position[] {
  return z
    .array(row)
    .parse(raw)
    .map((r) => {
      const quantity = r.quantity ?? r.netqty;
      if (quantity === undefined) throw new Error("Missing position quantity");
      return {
        accountId,
        source,
        instrumentId: instrumentIdentity({
          exchange: r.exchange,
          id: r.instrument_token ? String(r.instrument_token) : r.symboltoken,
          ticker: r.tradingsymbol,
        }),
        ticker: r.tradingsymbol,
        exchange: r.exchange,
        currency: "INR",
        quantity,
        averagePrice: r.average_price ?? r.avgnetprice ?? null,
        marketPrice: r.last_price ?? r.ltp ?? null,
        unrealizedPnL: r.unrealised ?? null,
        realizedPnL: r.realised ?? null,
        asOf,
      };
    });
}
