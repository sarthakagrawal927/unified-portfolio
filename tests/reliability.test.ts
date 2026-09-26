import { testDatabase } from "./d1";
import { withUser } from "../src/server/tenant";
import { test } from "node:test";
import assert from "node:assert/strict";
import { demo } from "./fixtures/portfolio";
import { portfolio } from "../src/core/portfolio";
import { sync, type SyncStore } from "../src/core/sync";
import {
  ProviderError,
  type Authorization,
  type PortfolioProvider,
  type Snapshot,
} from "../src/core/model";
import * as store from "../src/db/store";
import { data } from "../src/server/data";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createMcp } from "../src/mcp/tools";

const sample = () => structuredClone(demo());

function harness(auth: Authorization = { accessToken: "test" }) {
  const d = sample();
  let active = d.snapshots[0];
  let generation = 1;
  const failures: { code: string; needsLogin: boolean }[] = [];
  const savedAuth: Authorization[] = [];
  const fetches: Authorization[] = [];
  let published = 0;
  const repository: SyncStore = {
    acquire: async () => ({ generation, auth }),
    updateAuthorization: async (_, g, a) => {
      if (g === generation) savedAuth.push(a);
    },
    publish: async (_, g, s) => {
      if (g === generation) {
        active = s;
        published++;
      }
    },
    fail: async (_, g, code, needsLogin) => {
      if (g === generation) failures.push({ code, needsLogin });
    },
  };
  const provider: PortfolioProvider = {
    id: "zerodha",
    connect: async () => ({ url: "" }),
    exchange: async () => auth,
    refresh: async () => {
      throw new ProviderError("SESSION_EXPIRED", true);
    },
    fetch: async (a) => {
      fetches.push(a);
      return d.snapshots[0];
    },
  };
  return {
    repository,
    provider,
    failures,
    savedAuth,
    fetches,
    active: () => active,
    published: () => published,
  };
}

test("expired consent refreshes before fetch and publishes with rotated credentials", async () => {
  const h = harness({
    accessToken: "expired",
    refreshToken: "refresh",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  const rotated = {
    accessToken: "rotated",
    refreshToken: "rotated-refresh",
    expiresAt: "2999-01-01T00:00:00.000Z",
  };
  let refreshes = 0;
  h.provider.refresh = async () => {
    refreshes++;
    return rotated;
  };
  assert.equal((await sync(h.provider, h.repository)).status, "success");
  assert.equal(refreshes, 1);
  assert.deepEqual(h.savedAuth, [rotated]);
  assert.deepEqual(h.fetches, [rotated]);
  assert.equal(h.published(), 1);
});

test("unexpired consent does not refresh", async () => {
  const h = harness({
    accessToken: "valid",
    expiresAt: "2999-01-01T00:00:00.000Z",
  });
  let refreshes = 0;
  h.provider.refresh = async () => {
    refreshes++;
    return { accessToken: "rotated" };
  };
  assert.equal((await sync(h.provider, h.repository)).status, "success");
  assert.equal(refreshes, 0);
  assert.equal(h.published(), 1);
});

test("expired consent with failed refresh never fetches and keeps the stored snapshot", async () => {
  const h = harness({
    accessToken: "expired",
    refreshToken: "refresh",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  const previous = h.active();
  const result = await sync(h.provider, h.repository);
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" && result.code, "SESSION_EXPIRED");
  assert.deepEqual(h.fetches, []);
  assert.equal(h.published(), 0);
  assert.equal(h.active(), previous);
  assert.deepEqual(h.failures, [
    { code: "SESSION_EXPIRED", needsLogin: true },
  ]);
});

test("a login rejection with a refresh token retries exactly once with persisted credentials", async () => {
  const h = harness({ accessToken: "stale", refreshToken: "refresh" });
  const rotated = { accessToken: "rotated", refreshToken: "rotated" };
  let refreshes = 0;
  let calls = 0;
  h.provider.refresh = async () => {
    refreshes++;
    return rotated;
  };
  h.provider.fetch = async (a) => {
    h.fetches.push(a);
    if (++calls === 1) throw new ProviderError("SESSION_EXPIRED", true);
    return sample().snapshots[0];
  };
  assert.equal((await sync(h.provider, h.repository)).status, "success");
  assert.equal(refreshes, 1);
  assert.deepEqual(h.savedAuth, [rotated]);
  assert.deepEqual(h.fetches, [
    { accessToken: "stale", refreshToken: "refresh" },
    rotated,
  ]);
  assert.equal(h.published(), 1);
});

test("a repeated login rejection after retry does not loop or publish", async () => {
  const h = harness({ accessToken: "stale", refreshToken: "refresh" });
  let refreshes = 0;
  h.provider.refresh = async () => {
    refreshes++;
    return { accessToken: "rotated", refreshToken: "rotated" };
  };
  h.provider.fetch = async () => {
    throw new ProviderError("SESSION_EXPIRED", true);
  };
  const result = await sync(h.provider, h.repository);
  assert.equal(result.status, "failed");
  assert.equal(refreshes, 1);
  assert.equal(h.published(), 0);
  assert.deepEqual(h.failures, [
    { code: "SESSION_EXPIRED", needsLogin: true },
  ]);
});

test("a login rejection without a refresh token never calls refresh", async () => {
  const h = harness({ accessToken: "stale" });
  let refreshes = 0;
  h.provider.refresh = async () => {
    refreshes++;
    return { accessToken: "rotated" };
  };
  h.provider.fetch = async () => {
    throw new ProviderError("SESSION_EXPIRED", true);
  };
  await sync(h.provider, h.repository);
  assert.equal(refreshes, 0);
  assert.deepEqual(h.failures, [
    { code: "SESSION_EXPIRED", needsLogin: true },
  ]);
});

test("a held lease skips sync without touching the provider", async () => {
  const h = harness();
  h.repository.acquire = async () => null;
  let calls = 0;
  h.provider.fetch = async () => {
    calls++;
    return sample().snapshots[0];
  };
  assert.equal((await sync(h.provider, h.repository)).status, "skipped");
  assert.equal(calls, 0);
  assert.equal(h.published(), 0);
  assert.deepEqual(h.failures, []);
});

test("partial reads can never replace the stored complete snapshot", async () => {
  const cases: [string, (s: Snapshot) => unknown][] = [
    [
      "holding references an undeclared account",
      (s) => ({
        ...s,
        holdings: [{ ...s.holdings[0], accountId: "zerodha:ghost" }],
      }),
    ],
    [
      "position references an undeclared account",
      (s) => ({
        ...s,
        positions: [{ ...s.positions[0], accountId: "zerodha:ghost" }],
      }),
    ],
    [
      "cash references an undeclared account",
      (s) => ({
        ...s,
        cash: [
          {
            accountId: "zerodha:ghost",
            currency: "INR",
            available: "1",
            asOf: s.asOf,
          },
        ],
      }),
    ],
    [
      "foreign-source row inside a provider payload",
      (s) => ({
        ...s,
        holdings: [
          { ...s.holdings[0], source: "indmoney", accountId: s.accounts[0].id },
        ],
      }),
    ],
    [
      "duplicate canonical holding key",
      (s) => ({ ...s, holdings: [s.holdings[0], s.holdings[0]] }),
    ],
    [
      "holdings coverage below complete",
      (s) => ({ ...s, coverage: { ...s.coverage, holdings: "partial" } }),
    ],
    ["malformed observation timestamp", (s) => ({ ...s, asOf: "recently" })],
  ];
  for (const [name, mutate] of cases) {
    const h = harness();
    const previous = h.active();
    h.provider.fetch = async () => mutate(sample().snapshots[0]) as Snapshot;
    const result = await sync(h.provider, h.repository);
    assert.equal(result.status, "failed", name);
    assert.equal(h.published(), 0, name);
    assert.equal(h.active(), previous, name);
    assert.deepEqual(
      h.failures.map((f) => f.code),
      ["INVALID_PAYLOAD"],
      name,
    );
  }
});

test("unknown-custody aggregator rows are excluded only when a same-currency direct observation exists", () => {
  const d = sample();
  const direct = structuredClone(d.snapshots[0]);
  const aggregated = structuredClone(d.snapshots[2]);
  aggregated.holdings.forEach((h) => (h.custodyBroker = "Unknown custody"));
  const withoutUsd = portfolio([direct, aggregated], d.connections);
  assert.equal(withoutUsd.excluded.length, 0);
  assert.equal(withoutUsd.holdings.length, 5);
  direct.holdings.push({
    ...direct.holdings[0],
    instrumentId: "sample:USD",
    exchange: "NASDAQ",
    currency: "USD",
  });
  const withUsd = portfolio([direct, aggregated], d.connections);
  assert.equal(withUsd.excluded.length, 2);
  assert.equal(withUsd.holdings.length, 4);
});

test("merged snapshots can never contain a duplicate canonical holding", () => {
  const d = sample();
  const doubled = structuredClone(d.snapshots[0]);
  doubled.holdings.push(structuredClone(doubled.holdings[0]));
  assert.throws(
    () => portfolio([doubled], d.connections),
    /Duplicate canonical holding/,
  );
});

test("failure kinds persist ERROR versus NEEDS_LOGIN, release the lease and retain the snapshot", async () =>
  withUser("reliability-user", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
    const pg = await testDatabase();
    store.setDatabaseForTests(pg.db);
    try {
      const auth = { accessToken: "synthetic" };
      const snapshot = demo().snapshots[0];
      assert.equal(await store.saveAuthorization("zerodha", auth, 0), true);
      const lease = await store.acquire("zerodha");
      assert.ok(lease);
      await store.publish("zerodha", lease.generation, snapshot, auth, 10);
      const success = (await store.connectionList()).find(
        (c) => c.id === "zerodha",
      )!;
      assert.ok(success.lastSuccessAt);
      const transient = await store.acquire("zerodha");
      assert.ok(transient);
      await store.fail("zerodha", transient.generation, "RATE_LIMIT", false, 10);
      let connection = (await store.connectionList()).find(
        (c) => c.id === "zerodha",
      )!;
      assert.equal(connection.status, "ERROR");
      assert.equal(connection.errorCode, "RATE_LIMIT");
      assert.equal(connection.lastSuccessAt, success.lastSuccessAt);
      assert.deepEqual((await store.activeSnapshots())[0], snapshot);
      const retry = await store.acquire("zerodha");
      assert.ok(retry);
      await store.fail(
        "zerodha",
        retry.generation,
        "SESSION_EXPIRED",
        true,
        10,
      );
      connection = (await store.connectionList()).find(
        (c) => c.id === "zerodha",
      )!;
      assert.equal(connection.status, "NEEDS_LOGIN");
      assert.equal(connection.connected, true);
      assert.equal(connection.lastSuccessAt, success.lastSuccessAt);
      assert.deepEqual((await store.activeSnapshots())[0], snapshot);
      assert.ok(await store.acquire("zerodha"));
    } finally {
      await pg.close();
      store.setDatabaseForTests(undefined);
    }
  }));

test("reconnect is generation-fenced per user and cannot overwrite another owner's connection", async () =>
  withUser("owner-a", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString("base64");
    const pg = await testDatabase();
    store.setDatabaseForTests(pg.db);
    try {
      assert.equal(
        await store.saveAuthorization("zerodha", { accessToken: "a-token" }, 0),
        true,
      );
      const generationA = (await store.connectionList()).find(
        (c) => c.id === "zerodha",
      )!.generation;
      await withUser("owner-b", async () => {
        assert.equal(
          await store.saveAuthorization(
            "zerodha",
            { accessToken: "b-token" },
            generationA,
          ),
          false,
        );
        assert.equal(
          await store.saveAuthorization(
            "zerodha",
            { accessToken: "b-token" },
            0,
          ),
          true,
        );
      });
      const connection = (await store.connectionList()).find(
        (c) => c.id === "zerodha",
      )!;
      assert.equal(connection.status, "CONNECTED");
      const lease = await store.acquire("zerodha");
      assert.equal(lease?.auth.accessToken, "a-token");
    } finally {
      await pg.close();
      store.setDatabaseForTests(undefined);
    }
  }));

test("dashboard and MCP report the same snapshot, freshness and limitations", async () =>
  withUser("parity-user", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const pg = await testDatabase();
    store.setDatabaseForTests(pg.db);
    try {
      const d = demo();
      const auth = { accessToken: "synthetic" };
      await store.saveAuthorization("zerodha", auth, 0);
      const zerodhaLease = await store.acquire("zerodha");
      assert.ok(zerodhaLease);
      await store.publish(
        "zerodha",
        zerodhaLease.generation,
        d.snapshots[0],
        auth,
        10,
      );
      await store.saveAuthorization("indmoney", auth, 0);
      const indmoneyLease = await store.acquire("indmoney");
      assert.ok(indmoneyLease);
      await store.publish(
        "indmoney",
        indmoneyLease.generation,
        d.snapshots[2],
        auth,
        10,
      );
      const expired = await store.acquire("indmoney");
      assert.ok(expired);
      await store.fail(
        "indmoney",
        expired.generation,
        "SESSION_EXPIRED",
        true,
        10,
      );
      const dashboard = await data();
      const providerStatus = Object.fromEntries(
        dashboard.current.providers.map((p) => [p.provider, p.status]),
      );
      assert.deepEqual(providerStatus, {
        zerodha: "current",
        indmoney: "stale",
      });
      const server = createMcp("parity-user");
      const client = new Client({ name: "test", version: "1" });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await server.connect(a);
      await client.connect(b);
      try {
        const summary = await client.callTool({
          name: "portfolio_summary",
          arguments: {},
        });
        assert.notEqual(summary.isError, true);
        const payload = JSON.parse(
          (summary.content as { text: string }[])[0].text,
        );
        assert.equal(payload.asOf, dashboard.current.asOf);
        assert.equal(payload.dataState, "latest_stored");
        assert.deepEqual(payload.providers, dashboard.current.providers);
        assert.deepEqual(payload.coverage, dashboard.current.coverage);
        assert.equal(payload.data.includesStaleData, true);
        const status = await client.callTool({
          name: "get_connection_status",
          arguments: {},
        });
        const connections = JSON.parse(
          (status.content as { text: string }[])[0].text,
        ).data;
        assert.deepEqual(
          connections,
          dashboard.connections.map(({ generation, ...c }) => c),
        );
        assert.equal(
          connections.find((c: { id: string }) => c.id === "indmoney")?.status,
          "NEEDS_LOGIN",
        );
      } finally {
        await client.close();
        await server.close();
      }
    } finally {
      await pg.close();
      store.setDatabaseForTests(undefined);
    }
  }));
