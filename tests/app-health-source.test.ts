import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root layout carries the Unified Portfolio Watchtower identity", async () => {
  const source = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

  assert.match(source, /https:\/\/health\.sassmaker\.com\/tracker\.js/);
  assert.match(source, /data-project="app-72bfc54f-c331-409f-b486-ca1382e53e98"/);
  assert.match(source, /data-key="ahk_pub_a5f420d99d3c8a9dad6e30bb188989248c445cac80cc0aa011399d11b3b79678"/);
});
