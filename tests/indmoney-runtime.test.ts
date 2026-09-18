import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Miniflare } from "miniflare";

test("INDmoney tool schemas compile and enforce output types in Workers", async () => {
  const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
  const bundle = await build({
    stdin: {
      contents: `
import { createIndmoneyClient } from './src/providers/indmoney/index.ts';
export default { fetch() {
 const client = createIndmoneyClient();
 client.cacheToolMetadata([{name:'contract',inputSchema:{type:'object'},outputSchema:{type:'object',properties:{quantity:{type:'number'}},required:['quantity']}}]);
 const validate = client.getToolOutputValidator('contract');
 return Response.json({valid:validate({quantity:1}).valid,invalid:validate({quantity:'wrong'}).valid});
}};`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    external: ["node:*"],
  });
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: "2026-07-30",
    compatibilityFlags: ["nodejs_compat"],
    script: bundle.outputFiles[0].text,
  });
  try {
    assert.deepEqual(
      await (await mf.dispatchFetch("https://test.invalid")).json(),
      { valid: true, invalid: false },
    );
  } finally {
    await mf.dispose();
  }
});
