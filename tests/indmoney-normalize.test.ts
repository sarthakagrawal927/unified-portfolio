import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetTypes,
  normalizeCategory,
  normalizeIndmoney,
  unpack,
} from "../src/providers/indmoney/normalize";
const asOf = "2026-09-13T00:00:00.000Z";
const row = {
  investment_code: "test-id",
  investment: "Synthetic contract fixture",
  asset_type: "US Stocks",
  market_value: 8400,
  invested_amount: 8000,
  total_units: 2,
  unit_price: 4200,
  broker: null,
  current_value_usd: 100,
  invested_value_usd: 90,
};
test("USD uses native value and native derived price, never INR unit_price", () => {
  const [h] = normalizeCategory({
    type: "US_STOCK",
    asOf,
    data: { holdings: [row] },
  });
  assert.equal(h.currency, "USD");
  assert.equal(h.marketValue, "100");
  assert.equal(h.marketPrice, "50");
  assert.equal(h.averagePrice, "45");
  assert.equal(h.instrumentId, "indmoney:US_STOCK:test-id");
  assert.equal(h.identityVerified, false);
  assert.throws(() =>
    normalizeCategory({
      type: "US_STOCK",
      asOf,
      data: { holdings: [{ ...row, current_value_usd: undefined }] },
    }),
  );
});
test("non-security assets preserve unknown quantity and cost", () => {
  const [h] = normalizeCategory({
    type: "SA",
    asOf,
    data: {
      holdings: [
        {
          ...row,
          asset_type: "SA",
          investment_code: null,
          total_units: null,
          unit_price: null,
          invested_amount: "Not available",
        },
      ],
    },
  });
  assert.equal(h.quantity, null);
  assert.equal(h.averagePrice, null);
  assert.equal(h.investedValue, null);
  assert.equal(h.marketValue, "8400");
});
test("embedded rate limits, malformed data and repeated rows fail closed", () => {
  assert.throws(
    () =>
      unpack({
        structuredContent: {
          result: JSON.stringify({ error: "rate", retry_after_seconds: 60 }),
        },
      }),
    { code: "RATE_LIMIT", retryAfterSeconds: 60 },
  );
  assert.throws(() =>
    normalizeCategory({
      type: "US_STOCK",
      asOf,
      data: { holdings: [row, row] },
    }),
  );
  assert.throws(() =>
    normalizeCategory({
      type: "US_STOCK",
      asOf,
      data: { holdings: [row], holding_error: true },
    }),
  );
  assert.throws(() => normalizeCategory({ type: "US_STOCK", asOf, data: {} }));
});
test("atomic snapshot requires every category and retains oldest retrieval time", () => {
  const categories = assetTypes.map((type) => ({
    type,
    asOf,
    data: { holdings: [] },
  }));
  assert.throws(() => normalizeIndmoney(categories.slice(1)));
  const snapshot = normalizeIndmoney(categories);
  assert.equal(snapshot.holdings.length, 0);
  assert.equal(snapshot.asOf, asOf);
  assert.ok(snapshot.observationNote);
});
