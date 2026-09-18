import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
export async function testDatabase() {
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('test'); } }",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
  });
  const db = await runtime.getD1Database("DB");
  const sql = await readFile(
    new URL("../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  for (const query of sql.split(";").filter((s) => s.trim()))
    await db.prepare(query).run();
  return { db: db as unknown as D1Database, close: () => runtime.dispose() };
}
