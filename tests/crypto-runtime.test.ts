import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import ts from "typescript";
import { Miniflare } from "miniflare";

test("encryption round-trips and rejects tampering inside the Workers runtime", async () => {
  const source = await readFile(
    new URL("../src/server/crypto.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: "2026-07-30",
    compatibilityFlags: ["nodejs_compat"],
    bindings: { TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") },
    script:
      compiled +
      `
export default { async fetch() {
  const value = { message: "Unicode ₹ private", nested: [1, 2] };
  const ciphertext = encrypt(value);
  const parts = ciphertext.split(".");
  parts[1] = Buffer.alloc(16).toString("base64url");
  let rejected = false;
  try { decrypt(parts.join(".")); } catch { rejected = true; }
  return Response.json({ value: decrypt(ciphertext), rejected, plaintextVisible: ciphertext.includes(value.message) });
}};`,
  });
  try {
    const result = await (
      await mf.dispatchFetch("https://test.invalid")
    ).json();
    assert.deepEqual(result, {
      value: { message: "Unicode ₹ private", nested: [1, 2] },
      rejected: true,
      plaintextVisible: false,
    });
  } finally {
    await mf.dispose();
  }
});
