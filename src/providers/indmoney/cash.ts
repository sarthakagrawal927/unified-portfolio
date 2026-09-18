import Decimal from "decimal.js";
import { z } from "zod";
import { ProviderError, type Snapshot } from "../../core/model";
const number = z.number().finite();
const summary = z.object({
  investments: z.array(
    z.object({ asset_type: z.string(), current_value: number }),
  ),
});
const stockSummary = z.object({
  asset_summary: z.object({ total_value: number, total_value_usd: number }),
});
export function includeIndmoneyWallet(
  snapshot: Snapshot,
  networth: unknown,
  usHoldings: unknown,
  asOf: string,
) {
  const investments = summary.parse(networth).investments;
  const wallets = investments.filter((v) => v.asset_type === "US_STOCK_WALLET");
  if (wallets.length > 1) throw new ProviderError("INVALID_PAYLOAD");
  if (!wallets.length) return snapshot;
  const stocks = investments.filter((v) => v.asset_type === "US_STOCK");
  if (stocks.length !== 1) return snapshot;
  const us = stockSummary.parse(usHoldings).asset_summary;
  // Require the same source stock valuation in both responses before inferring the conversion.
  if (
    new Decimal(stocks[0].current_value).minus(us.total_value).abs().gt("0.01")
  )
    return snapshot;
  if (us.total_value <= 0 || us.total_value_usd <= 0) return snapshot;
  const rate = new Decimal(us.total_value).div(us.total_value_usd);
  const balance = new Decimal(wallets[0].current_value)
    .div(rate)
    .toDecimalPlaces(2)
    .toFixed(2);
  const accountId = "indmoney:usd-wallet";
  snapshot.accounts.push({
    id: accountId,
    providerAccountId: accountId,
    currency: "USD",
    type: "wallet",
  });
  snapshot.cash.push({
    accountId,
    currency: "USD",
    available: balance,
    asOf,
    balanceType: "wallet",
    estimated: true,
    sourceValue: String(wallets[0].current_value),
    sourceCurrency: "INR",
    conversionRate: rate.toFixed(),
    conversionMethod: "Provider-implied FX from matching US stock valuations",
  });
  snapshot.coverage.cash = "complete";
  snapshot.coverage.cashCurrencies = ["USD"];
  snapshot.observationNote =
    "INDmoney USD wallet cash is an estimate converted from its net-worth valuation using the implied INR/USD rate from matching provider stock valuations. Native USD wallet cash is not supplied. Wallet value is not buying power or a verified withdrawable balance. Timestamps show retrieval time, not the underlying valuation time.";
  return snapshot;
}
