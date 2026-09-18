import { withUser } from "../src/server/tenant";
import { test } from "node:test";
import assert from "node:assert/strict";
import { demo } from "./fixtures/portfolio";
import { portfolio, allocation } from "../src/core/portfolio";
import {
  instrumentIdentity,
  ProviderError,
  type PortfolioProvider,
} from "../src/core/model";
import { normalizeZerodha } from "../src/providers/zerodha/normalize";
import { normalizeAngel } from "../src/providers/angelone";
import { sync, type SyncStore } from "../src/core/sync";
import { encrypt, decrypt } from "../src/server/crypto";
import { istExpiry } from "../src/providers/http";
const sample = () => structuredClone(demo());
test("ISIN unifies broker ticker aliases while exchange IDs remain scoped", () => {
  assert.equal(
    instrumentIdentity({
      isin: "INE002A01018",
      exchange: "NSE",
      ticker: "RELIANCE",
    }),
    instrumentIdentity({
      isin: "INE002A01018",
      exchange: "BSE",
      ticker: "RELIANCE-EQ",
    }),
  );
  assert.notEqual(
    instrumentIdentity({ exchange: "NSE", id: "1", ticker: "X" }),
    instrumentIdentity({ exchange: "BSE", id: "1", ticker: "X" }),
  );
});
test("currencies are never summed and unknown cost basis propagates", () => {
  const d = sample();
  d.snapshots[0].holdings[0].investedValue = null;
  const p = portfolio(d.snapshots, d.connections);
  assert.equal(p.totals.length, 2);
  assert.equal(p.totals.find((t) => t.currency === "INR")!.unrealizedPnL, null);
  assert.ok(p.totals.find((t) => t.currency === "USD")!.unrealizedPnL);
  assert.equal(p.includesStaleData, true);
});
test("aggregator replicas never inflate direct broker exposure", () => {
  const d = sample();
  const copy = {
    ...d.snapshots[0].holdings[0],
    source: "indmoney" as const,
    accountId: "indmoney:linked",
  };
  d.snapshots[2].holdings.push(copy);
  const p = portfolio(d.snapshots, d.connections);
  assert.equal(p.excluded.length, 1);
  assert.equal(p.holdings.length, 7);
});
test("aggregator observations are visible when no direct broker snapshot exists", () => {
  const d = sample();
  d.snapshots[2].holdings[0].identityVerified = false;
  const p = portfolio([d.snapshots[2]], d.connections);
  assert.equal(p.holdings.length, 2);
  assert.equal(p.excluded.length, 0);
});
test("allocation is independently normalized within each currency", () => {
  const d = sample();
  const groups = allocation(
    portfolio(d.snapshots, d.connections),
    "asset_class",
  );
  assert.equal(
    groups.filter((g) => g.currency === "USD")[0].percentage,
    "100.00",
  );
  assert.throws(() => allocation(d.current, "sql"));
});
test("freshness ages even with an otherwise connected session", () => {
  const d = sample();
  d.connections.forEach((c) => {
    c.status = "CONNECTED";
    c.lastSuccessAt = "2020-01-01T00:00:00.000Z";
  });
  d.snapshots.forEach((s) => (s.asOf = "2020-01-01T00:00:00.000Z"));
  assert.ok(
    portfolio(d.snapshots, d.connections).providers.every(
      (p) => p.status === "stale",
    ),
  );
  assert.deepEqual(
    portfolio(d.snapshots, d.connections).providers.map((p) => p.lastSync),
    d.snapshots.map((s) => s.asOf),
  );
});
test("Zerodha settlement quantities and sold quantities preserve decimal precision", () => {
  const [row] = normalizeZerodha(
    [
      {
        tradingsymbol: "X",
        exchange: "NSE",
        instrument_token: 1,
        quantity: 10,
        t1_quantity: 2,
        used_quantity: 3,
        average_price: 0.1,
        last_price: 0.2,
      },
    ],
    "account",
    new Date().toISOString(),
  );
  assert.equal(row.quantity, "9");
  assert.equal(row.marketValue, "1.8");
  assert.equal(row.investedValue, "0.9");
});
test("malformed broker payload and unsupported financed holdings are rejected", () => {
  assert.throws(() =>
    normalizeZerodha({}, "account", new Date().toISOString()),
  );
  assert.throws(() =>
    normalizeZerodha(
      [
        {
          tradingsymbol: "X",
          exchange: "NSE",
          instrument_token: 1,
          quantity: 1,
          average_price: 1,
          last_price: 1,
          mtf: { quantity: 10 },
        },
      ],
      "a",
      new Date().toISOString(),
    ),
  );
  assert.throws(() =>
    normalizeAngel([{ quantity: "oops" }], "a", new Date().toISOString()),
  );
});
test("token expiry follows IST boundaries", () => {
  assert.equal(
    istExpiry(6, new Date("2026-09-12T01:00:00Z")),
    "2026-09-13T00:30:00.000Z",
  );
  assert.equal(
    istExpiry(0, new Date("2026-09-12T12:00:00Z")),
    "2026-09-12T18:30:00.000Z",
  );
});
test("encrypted credentials authenticate ciphertext and do not contain plaintext", () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  const data = { accessToken: "synthetic-token" };
  const encrypted = encrypt(data);
  assert.ok(!encrypted.includes(data.accessToken));
  assert.deepEqual(decrypt(encrypted), data);
  const parts = encrypted.split(".");
  parts[1] = Buffer.alloc(16, 0).toString("base64url");
  assert.throws(() => decrypt(parts.join(".")));
});
function harness() {
  const d = sample();
  let active = d.snapshots[0];
  let failures: string[] = [];
  let published = 0;
  let generation = 1;
  const repository: SyncStore = {
    updateAuthorization: async () => {},
    acquire: async () => ({ generation, auth: { accessToken: "test" } }),
    publish: async (_, g, s) => {
      if (g === generation) {
        active = s;
        published++;
      }
    },
    fail: async (_, g, code) => {
      if (g === generation) failures.push(code);
    },
  };
  const provider: PortfolioProvider = {
    id: "zerodha",
    connect: async () => ({ url: "" }),
    exchange: async () => ({ accessToken: "test" }),
    refresh: async () => {
      throw new ProviderError("SESSION_EXPIRED", true);
    },
    fetch: async () => d.snapshots[0],
  };
  return {
    repository,
    provider,
    active: () => active,
    failures,
    published: () => published,
    disconnect: () => generation++,
  };
}
test("upstream failures preserve prior portfolio", async () => {
  const h = harness();
  const previous = h.active();
  h.provider.fetch = async () => {
    throw new ProviderError("RATE_LIMIT");
  };
  assert.equal((await sync(h.provider, h.repository)).status, "failed");
  assert.equal(h.active(), previous);
  assert.equal(h.published(), 0);
  assert.deepEqual(h.failures, ["RATE_LIMIT"]);
});
test("partial or cross-provider results cannot publish", async () => {
  const h = harness();
  h.provider.fetch = async () => ({
    ...sample().snapshots[0],
    provider: "angelone",
  });
  await sync(h.provider, h.repository);
  assert.equal(h.published(), 0);
  assert.deepEqual(h.failures, ["INVALID_PAYLOAD"]);
});
test("valid empty portfolio is accepted after a complete fetch", async () => {
  const h = harness();
  h.provider.fetch = async () => ({ ...sample().snapshots[0], holdings: [] });
  assert.equal((await sync(h.provider, h.repository)).status, "success");
  assert.equal(h.active().holdings.length, 0);
});
test("disconnect during fetch fences publication", async () => {
  const h = harness();
  h.provider.fetch = async () => {
    h.disconnect();
    return sample().snapshots[0];
  };
  await sync(h.provider, h.repository);
  assert.equal(h.published(), 0);
});
test("auth failure without refresh becomes an explicit login state", async () => {
  const h = harness();
  h.provider.fetch = async () => {
    throw new ProviderError("SESSION_EXPIRED", true);
  };
  await sync(h.provider, h.repository);
  assert.deepEqual(h.failures, ["SESSION_EXPIRED"]);
});

test("rotated credentials are saved even when subsequent portfolio fetch fails", async () => {
  const h = harness();
  let saved = false;
  h.repository.acquire = async () => ({
    generation: 1,
    auth: {
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: "2020-01-01T00:00:00Z",
    },
  });
  h.provider.refresh = async () => ({
    accessToken: "rotated",
    refreshToken: "rotated-refresh",
  });
  h.repository.updateAuthorization = async (_, g, a) => {
    assert.equal(g, 1);
    assert.equal(a.accessToken, "rotated");
    saved = true;
  };
  h.provider.fetch = async () => {
    assert.ok(saved);
    throw new ProviderError("RATE_LIMIT");
  };
  await sync(h.provider, h.repository);
  assert.equal(h.published(), 0);
  assert.ok(saved);
});

test("derivative positions preserve reported P&L without calculating notional wealth", async () => {
  const { normalizePositions } = await import("../src/providers/positions");
  const [position] = normalizePositions(
    [
      {
        tradingsymbol: "FUT",
        exchange: "NFO",
        symboltoken: "1",
        netqty: "-50",
        avgnetprice: "100",
        ltp: "90",
        unrealised: "500",
        realised: "0",
      },
    ],
    "angelone",
    "account",
    new Date().toISOString(),
  );
  assert.equal(position.quantity, "-50");
  assert.equal(position.unrealizedPnL, "500");
  assert.ok(!("marketValue" in position));
});
