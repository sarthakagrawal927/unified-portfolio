import { z } from "zod";
import Decimal from "decimal.js";
import {
  instrumentIdentity,
  type Holding,
  ProviderError,
} from "../../core/model";
const numeric = z.number().finite();
const row = z.object({
  tradingsymbol: z.string().min(1),
  exchange: z.string(),
  instrument_token: numeric,
  isin: z.string().optional(),
  quantity: numeric,
  average_price: numeric,
  last_price: numeric,
  t1_quantity: numeric.optional(),
  used_quantity: numeric.optional(),
  discrepancy: z.boolean().optional(),
  multiplier: numeric.optional(),
  mtf: z.object({ quantity: numeric }).passthrough().optional(),
});
export function normalizeZerodha(
  data: unknown,
  accountId: string,
  asOf: string,
): Holding[] {
  return z
    .array(row)
    .parse(data)
    .map((r) => {
      if (r.mtf?.quantity) throw new ProviderError("INVALID_PAYLOAD");
      const quantity = new Decimal(r.quantity)
        .plus(r.t1_quantity || 0)
        .minus(r.used_quantity || 0);
      if (quantity.isNegative()) throw new ProviderError("INVALID_PAYLOAD");
      const multiplier = 1;
      const basis = r.discrepancy ? null : new Decimal(r.average_price);
      return {
        accountId,
        source: "zerodha",
        custodyBroker: "zerodha",
        instrumentId: instrumentIdentity({
          isin: r.isin,
          exchange: r.exchange,
          id: String(r.instrument_token),
          ticker: r.tradingsymbol,
        }),
        isin: r.isin,
        ticker: r.tradingsymbol,
        name: r.tradingsymbol,
        exchange: r.exchange,
        assetClass: "Indian Equity",
        country: "IN",
        sector: "Unknown",
        currency: "INR",
        quantity: quantity.toFixed(),
        averagePrice: basis?.toFixed() ?? null,
        investedValue:
          basis?.times(quantity).times(multiplier).toFixed() ?? null,
        marketPrice: String(r.last_price),
        marketValue: quantity.times(r.last_price).times(multiplier).toFixed(),
        asOf,
        identityVerified: true,
      };
    });
}
