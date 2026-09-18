import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createMcp, serverInstructions, toolNames } from "../src/mcp/tools";
import { activeProviders } from "../src/core/model";
test("MCP exposes exactly eight financial read tools and all responses include freshness", async () => {
  const server = createMcp("test-user");
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    assert.equal(client.getInstructions(), serverInstructions);
    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map((t) => t.name).sort(),
      [...toolNames].sort(),
    );
    for (const name of [
      "portfolio_summary",
      "get_holdings",
      "get_allocation",
      "get_connection_status",
    ]) {
      assert.ok(
        result.tools.find((t) => t.name === name)?.inputSchema.properties
          ?.owner_label,
      );
    }
    for (const t of result.tools) {
      assert.equal(t.annotations?.readOnlyHint, true);
      assert.equal(t.annotations?.destructiveHint, false);
    }
    const args: Record<string, Record<string, unknown>> = {
      get_holding: { symbol: "RELIANCE" },
      get_allocation: { dimension: "broker" },
      get_portfolio_history: { start: "2020-01-01", end: "2030-01-01" },
      get_performance: { period: "ALL" },
    };
    for (const name of toolNames) {
      const result = await client.callTool({
        name,
        arguments: args[name] || {},
      });
      assert.notEqual(result.isError, true);
      const payload = JSON.parse(
        (result.content as { text: string }[])[0].text,
      );
      assert.ok("asOf" in payload);
      assert.ok("retrievedAt" in payload);
      assert.ok(["current", "latest_stored"].includes(payload.dataState));
      assert.deepEqual(
        payload.providers.map((p: { provider: string }) => p.provider).sort(),
        [...activeProviders].sort(),
      );
      assert.ok(payload.coverage);
    }
    const unknown = await client.callTool({
      name: "place_order",
      arguments: {},
    });
    assert.equal(unknown.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
