import { test } from "node:test";
import assert from "node:assert/strict";
import { demo } from "./fixtures/portfolio";
import { labeledPortfolio } from "../src/core/labels";
import { portfolio, allocation } from "../src/core/portfolio";
test("owner labels filter complete provider snapshots without mixing owners or mutating observations", () => {
  const d = demo();
  const labels = { zerodha: "Mine", indmoney: "Mine", angelone: "Mom’s" };
  const mine = labeledPortfolio(d.snapshots, d.connections, labels, "mine");
  assert.deepEqual(
    mine.snapshots.map((s) => s.provider),
    ["zerodha", "indmoney"],
  );
  assert.ok(
    mine.snapshots
      .flatMap((s) => s.holdings)
      .every((h) => h.ownerLabel === "Mine"),
  );
  const mom = labeledPortfolio(d.snapshots, d.connections, labels, "Mom’s");
  assert.deepEqual(
    mom.connections.map((c) => c.id),
    ["angelone"],
  );
  const p = portfolio(mom.snapshots, mom.connections);
  assert.ok(p.providers.every((p) => p.ownerLabel === "Mom’s"));
  assert.ok(allocation(p, "owner").every((a) => a.label === "Mom’s"));
  assert.equal(
    labeledPortfolio(d.snapshots, d.connections, labels, "missing").snapshots
      .length,
    0,
  );
  assert.equal(d.snapshots[0].holdings[0].ownerLabel, undefined);
});
