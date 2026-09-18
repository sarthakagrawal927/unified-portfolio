import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Miniflare } from "miniflare";
test("Kite transport uses a valid Workers request and rejects upstream redirects", async () => {
  const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
  const bundle = await build({
    stdin: {
      contents: `import {openKite} from './src/providers/zerodha/mcp.ts';
 export default {async fetch(){
 let mode='',calls=0;
 globalThis.fetch=async(input,init)=>{const r=new Request(input,init);mode=r.redirect;calls++;return new Response(null,{status:302,headers:{location:'https://example.invalid'}})};
 try{await openKite();return Response.json({unexpected:true})}catch(e){return Response.json({mode,calls,code:e.code})}
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
      { mode: "manual", calls: 1, code: "INVALID_PAYLOAD" },
    );
  } finally {
    await mf.dispose();
  }
});
