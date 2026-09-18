import { test } from "node:test";
import assert from "node:assert/strict";
import { demo } from "./fixtures/portfolio";
import { scopeSnapshots } from "../src/core/scope";
import { portfolio } from "../src/core/portfolio";
import { normalizeIndmoney } from "../src/providers/indmoney/normalize";
test("USD scope filters only INDmoney and preserves direct broker sources", () => {
  const d = demo();
  d.snapshots[2].holdings.push({
    ...d.snapshots[0].holdings[0],
    source: "indmoney",
    accountId: "linked",
  });
  const scoped = scopeSnapshots(d.snapshots, "USD");
  assert.equal(scoped[0], d.snapshots[0]);
  assert.equal(scoped[1], d.snapshots[1]);
  assert.ok(scoped[2].holdings.every((h) => h.currency === "USD"));
  assert.ok(d.snapshots[2].holdings.some((h) => h.currency === "INR"));
  assert.equal(scoped[2].currencyScope, "USD");
});
test("complete USD import needs only the requested category and exposes missing cash", () => {
  const s = normalizeIndmoney(
    [
      {
        type: "US_STOCK",
        asOf: new Date().toISOString(),
        data: { holdings: [] },
      },
    ],
    ["US_STOCK"],
  );
  assert.equal(s.currencyScope, "USD");
  assert.equal(s.coverage.cash, "unavailable");
  const d = demo();
  d.snapshots[2].coverage.cash = "unavailable";
  const p = portfolio([d.snapshots[2]], d.connections);
  assert.ok(p.totals.every((t) => t.cash === null && t.totalValue === null));
});
