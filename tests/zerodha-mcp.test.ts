import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openKite,
  assertReadTool,
  loginUrl,
  resultText,
} from "../src/providers/zerodha/mcp";
import { kiteCash } from "../src/providers/zerodha/cash";
test("Kite only permits approved reads; trading and arbitrary tool names fail closed", () => {
  for (const name of [
    "get_profile",
    "get_holdings",
    "get_mf_holdings",
    "get_margins",
  ])
    assert.doesNotThrow(() => assertReadTool(name));
  for (const name of [
    "place_order",
    "cancel_order",
    "modify_order",
    "place_gtt_order",
    "login",
    "get_holdings ",
    "run_sql",
  ])
    assert.throws(() => assertReadTool(name));
});
test("Kite authorization URLs cannot redirect credentials to other origins or paths", () => {
  const url = "https://mcp.kite.trade/authorize?session_id=synthetic";
  assert.equal(loginUrl(`[Login](${url}) ${url}`), url);
  for (const text of [
    "https://evil.test/authorize?session_id=x",
    "https://mcp.kite.trade.evil.test/authorize?session_id=x",
    "https://mcp.kite.trade/mcp?session_id=x",
    "https://mcp.kite.trade/authorize?session_id=x&redirect=https://evil.test",
    "https://mcp.kite.trade/authorize",
    `${url} https://evil.test/`,
  ])
    assert.throws(() => loginUrl(text));
});
test("Provider errors cannot be interpreted as portfolio data or leak upstream messages", () => {
  assert.throws(
    () =>
      resultText({
        isError: true,
        content: [{ type: "text", text: "Please log in first secret" }],
      }),
    (e) => (e as Error).message === "SESSION_EXPIRED",
  );
  assert.throws(
    () =>
      resultText({
        isError: true,
        content: [{ type: "text", text: "upstream secret" }],
      }),
    (e) => (e as Error).message === "UPSTREAM_ERROR",
  );
  assert.throws(() => resultText({ content: [] }));
});
test("Cash uses reported current balance, excludes disabled segments and never substitutes margin collateral", () => {
  const segment = {
    enabled: true,
    net: 9000,
    available: { cash: 500, live_balance: 125, collateral: 8500 },
  };
  const cash = kiteCash(
    { equity: segment, commodity: { ...segment, enabled: false } },
    "zerodha:synthetic",
    "2026-09-13T00:00:00.000Z",
  );
  assert.equal(cash.length, 1);
  assert.equal(cash[0].available, "125");
  assert.throws(() =>
    kiteCash(
      {
        equity: { enabled: true, available: { cash: 500 } },
        commodity: segment,
      },
      "x",
      "x",
    ),
  );
});

test("MCP resumes the same session and allows retry after unfinished login", async () => {
  const original = globalThis.fetch;
  let initialized = 0,
    authenticated = false;
  const methods: string[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init?.body));
    methods.push(request.method);
    const headers = new Headers(init?.headers);
    if (request.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    let result: unknown;
    if (request.method === "initialize") {
      initialized++;
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "synthetic", version: "1" },
      };
    } else {
      assert.equal(headers.get("mcp-session-id"), "synthetic-session");
      result =
        request.params.name === "login"
          ? {
              content: [
                {
                  type: "text",
                  text: "https://mcp.kite.trade/authorize?session_id=synthetic",
                },
              ],
            }
          : authenticated
            ? {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ user_id: "synthetic-user" }),
                  },
                ],
              }
            : {
                isError: true,
                content: [
                  { type: "text", text: "Failed to execute get_profile" },
                ],
              };
    }
    return Response.json(
      { jsonrpc: "2.0", id: request.id, result },
      { headers: { "mcp-session-id": "synthetic-session" } },
    );
  }) as typeof fetch;
  try {
    const first = await openKite();
    await first.login();
    const sid = first.sessionId();
    await first.close();
    const second = await openKite(sid);
    await assert.rejects(
      second.read("get_profile"),
      (e) => (e as Error).message === "SESSION_EXPIRED",
    );
    authenticated = true;
    assert.deepEqual(await second.read("get_profile"), {
      user_id: "synthetic-user",
    });
    await second.close();
    assert.equal(initialized, 1);
    assert.ok(!methods.includes("DELETE"));
  } finally {
    globalThis.fetch = original;
  }
});
