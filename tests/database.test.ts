import { testDatabase } from "./d1";
import { withUser } from "../src/server/tenant";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../src/db/store";
import { demo } from "./fixtures/portfolio";
test("D1 atomic publication, leases, disconnect fencing, one-use codes and immutable daily history", async () =>
  withUser("test-user", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    const pg = await testDatabase();
    store.setDatabaseForTests(pg.db);
    try {
      const auth = { accessToken: "synthetic" };
      assert.equal(await store.saveAuthorization("zerodha", auth, 0), true);
      const lease = await store.acquire("zerodha");
      assert.ok(lease);
      assert.equal(await store.acquire("zerodha"), null);
      const snapshot = demo().snapshots[0];
      await store.publish("zerodha", lease.generation, snapshot, auth, 10);
      assert.equal((await store.activeSnapshots()).length, 1);
      assert.equal((await store.connectionList())[0].status, "CONNECTED");
      const next = await store.acquire("zerodha");
      assert.ok(next);
      await store.fail("zerodha", next.generation, "RATE_LIMIT", false, 10);
      assert.deepEqual((await store.activeSnapshots())[0], snapshot);
      const racing = await store.acquire("zerodha");
      assert.ok(racing);
      await store.disconnect("zerodha");
      await store.publish(
        "zerodha",
        racing.generation,
        { ...snapshot, holdings: [] },
        auth,
        10,
      );
      assert.deepEqual((await store.activeSnapshots())[0], snapshot);
      assert.equal((await store.connectionList())[0].connected, false);
      assert.equal(await store.acquire("zerodha"), null);
      assert.equal(await store.saveAuthorization("zerodha", auth, 0), false);
      const row = await pg.db
        .prepare(
          "SELECT credentials FROM connections WHERE user_id='test-user'",
        )
        .first<{ credentials: string | null }>();
      assert.equal(row?.credentials, null);
      await store.putRecord("code", "test", { id: 1 }, 60);
      const codes = await Promise.all([
        store.record("code", "test", true),
        store.record("code", "test", true),
      ]);
      assert.equal(codes.filter(Boolean).length, 1);
      await store.putRecord("code", "expired", {}, -1);
      assert.equal(await store.record("code", "expired"), null);
      await store.dailySnapshot("2026-09-12", { value: 1 });
      await store.dailySnapshot("2026-09-12", { value: 2 });
      assert.deepEqual(await store.history(), [
        { day: "2026-09-12", value: 1 },
      ]);
      assert.equal(await store.rateLimit("test", 1, 60), true);
      assert.equal(await store.rateLimit("test", 1, 60), false);
      await store.putRecord(
        "access",
        "first-user-access",
        { userId: "test-user" },
        3600,
      );
      await withUser("second-user", async () => {
        assert.deepEqual(await store.activeSnapshots(), []);
        assert.deepEqual(await store.history(), []);
        assert.equal((await store.connectionList())[0].connected, false);
        assert.equal(await store.acquire("zerodha"), null);
        assert.equal(
          await store.saveAuthorization(
            "zerodha",
            { accessToken: "second" },
            0,
          ),
          true,
        );
        const ownLease = await store.acquire("zerodha");
        assert.ok(ownLease);
        await store.publish(
          "zerodha",
          ownLease.generation,
          { ...snapshot, holdings: [] },
          { accessToken: "second" },
          1,
        );
        await store.dailySnapshot("2026-09-12", { value: 99 });
        await store.revokeMcp();
        assert.ok(await store.record("access", "first-user-access"));
        assert.deepEqual(await store.history(), [
          { day: "2026-09-12", value: 99 },
        ]);
        await store.disconnect("zerodha");
      });
      assert.deepEqual((await store.activeSnapshots())[0], snapshot);
      assert.deepEqual(await store.history(), [
        { day: "2026-09-12", value: 1 },
      ]);
      const epoch = await store.mcpEpoch();
      await store.revokeMcp();
      assert.equal(await store.mcpEpoch(), epoch + 1);
    } finally {
      await pg.close();
      store.setDatabaseForTests(undefined);
    }
  }));
