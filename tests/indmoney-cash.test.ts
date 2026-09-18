import { test } from "node:test";
import assert from "node:assert/strict";
import { includeIndmoneyWallet } from "../src/providers/indmoney/cash";
import { normalizeIndmoney } from "../src/providers/indmoney/normalize";
import { portfolio } from "../src/core/portfolio";
const asOf = "2026-09-13T00:00:00.000Z";
const snapshot = () =>
  normalizeIndmoney(
    [{ type: "US_STOCK", asOf, data: { holdings: [] } }],
    ["US_STOCK"],
  );
const networth = {
  investments: [
    { asset_type: "US_STOCK", current_value: 8400 },
    { asset_type: "US_STOCK_WALLET", current_value: 4200 },
  ],
};
const holdings = { asset_summary: { total_value: 8400, total_value_usd: 100 } };
test("wallet conversion retains source value and marks USD as an estimate", () => {
  const s = includeIndmoneyWallet(snapshot(), networth, holdings, asOf);
  assert.equal(s.cash[0].available, "50.00");
  assert.equal(s.cash[0].estimated, true);
  assert.equal(s.cash[0].sourceValue, "4200");
  assert.equal(s.cash[0].conversionRate, "84");
  const p = portfolio([s], []);
  assert.equal(p.totals[0].cash, "50");
  assert.equal(p.totals[0].cashEstimated, true);
  assert.equal(p.totals[0].totalValue, "50");
});
test("missing wallet, mismatched stock valuations and missing FX never fabricate cash", () => {
  assert.equal(
    includeIndmoneyWallet(snapshot(), { investments: [] }, holdings, asOf).cash
      .length,
    0,
  );
  assert.equal(
    includeIndmoneyWallet(
      snapshot(),
      networth,
      { asset_summary: { total_value: 8401, total_value_usd: 100 } },
      asOf,
    ).cash.length,
    0,
  );
  assert.equal(
    includeIndmoneyWallet(
      snapshot(),
      networth,
      { asset_summary: { total_value: 8400, total_value_usd: 0 } },
      asOf,
    ).cash.length,
    0,
  );
  assert.throws(() =>
    includeIndmoneyWallet(
      snapshot(),
      { investments: [...networth.investments, networth.investments[1]] },
      holdings,
      asOf,
    ),
  );
});
