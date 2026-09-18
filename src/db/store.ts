import { AsyncLocalStorage } from "node:async_hooks";
import { userId, currentUser } from "../server/tenant";
import { decrypt, encrypt, hash, randomToken } from "../server/crypto";
import {
  activeProviders,
  SnapshotSchema,
  type Authorization,
  type Connection,
  type ProviderId,
  type Snapshot,
} from "../core/model";

const context = new AsyncLocalStorage<D1DatabaseSession>();
let testDatabase: D1Database | undefined;
export function setDatabaseForTests(value: D1Database | undefined) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test database injection forbidden");
  testDatabase = value;
}
export function withDatabase<T>(database: D1Database, run: () => T): T {
  // Primary reads avoid stale authorization and revocation decisions.
  return context.run(database.withSession("first-primary"), run);
}
function db() {
  const database = context.getStore() || testDatabase;
  if (!database) throw new Error("Cloudflare D1 binding required");
  return database;
}
export function databaseConfigured() {
  return Boolean(context.getStore() || testDatabase);
}
const statement = (query: string, ...values: (string | number | null)[]) =>
  db()
    .prepare(query)
    .bind(...values);
const iso = (n: number | null) =>
  n === null ? null : new Date(n).toISOString();
type ConnectionRow = {
  id: ProviderId;
  status: Connection["status"];
  connected: number;
  last_attempt_at: number | null;
  last_success_at: number | null;
  error_code: string | null;
  generation: number;
  expires_at: number | null;
};
export async function connectionList(): Promise<Connection[]> {
  const { results } = await statement(
    "SELECT * FROM connections WHERE user_id = ?",
    userId(),
  ).all<ConnectionRow>();
  return activeProviders.map((id) => {
    const row = results.find((r) => r.id === id);
    return {
      id,
      status: row?.status || "NEEDS_LOGIN",
      connected: Boolean(row?.connected),
      lastAttemptAt: iso(row?.last_attempt_at ?? null),
      lastSuccessAt: iso(row?.last_success_at ?? null),
      errorCode: row?.error_code || null,
      generation: row?.generation || 0,
      expiresAt: iso(row?.expires_at ?? null),
    };
  });
}
export async function activeSnapshots(): Promise<Snapshot[]> {
  const { results } = await statement(
    "SELECT s.data FROM connections c JOIN snapshots s ON c.active_snapshot_id=s.id AND c.user_id=s.user_id WHERE c.user_id=?",
    userId(),
  ).all<{ data: string }>();
  return results.map((r) => SnapshotSchema.parse(JSON.parse(r.data)))
    .filter((snapshot) => activeProviders.some((id) => id === snapshot.provider));
}
export async function saveAuthorization(
  id: ProviderId,
  auth: Authorization,
  expectedGeneration: number,
) {
  const result = await db().batch([
    statement(
      "INSERT INTO connections(user_id,id) VALUES(?,?) ON CONFLICT DO NOTHING",
      userId(),
      id,
    ),
    statement(
      "UPDATE connections SET credentials=?, connected=1, status='CONNECTED', error_code=NULL, expires_at=?, generation=generation+1, lease_until=NULL WHERE user_id=? AND id=? AND generation=? RETURNING id",
      encrypt(auth),
      auth.expiresAt ? Date.parse(auth.expiresAt) : null,
      userId(),
      id,
      expectedGeneration,
    ),
  ]);
  return result[1].results.length === 1;
}
export async function disconnect(id: ProviderId) {
  await db().batch([
    statement(
      "INSERT INTO connections(user_id,id) VALUES(?,?) ON CONFLICT DO NOTHING",
      userId(),
      id,
    ),
    statement(
      "UPDATE connections SET credentials=NULL,connected=0,status='NEEDS_LOGIN',error_code=NULL,expires_at=NULL,lease_until=NULL,generation=generation+1 WHERE user_id=? AND id=?",
      userId(),
      id,
    ),
  ]);
}
export async function acquire(id: ProviderId) {
  const now = Date.now();
  const row = await statement(
    "UPDATE connections SET status='SYNCING',generation=generation+1,last_attempt_at=?,lease_until=? WHERE user_id=? AND id=? AND credentials IS NOT NULL AND connected=1 AND (lease_until IS NULL OR lease_until<=?) RETURNING generation,credentials",
    now,
    now + 120_000,
    userId(),
    id,
    now,
  ).first<{ generation: number; credentials: string }>();
  return row
    ? {
        generation: row.generation,
        auth: decrypt<Authorization>(row.credentials),
      }
    : null;
}
export async function publish(
  id: ProviderId,
  generation: number,
  snapshot: Snapshot,
  auth: Authorization,
  durationMs: number,
) {
  const uid = userId(),
    sid = randomToken(),
    now = Date.now();
  const condition =
    "SELECT 1 FROM connections WHERE user_id=? AND id=? AND generation=? AND connected=1";
  // Every statement shares one atomic D1 transaction and the same generation fence.
  await db().batch([
    statement(
      `INSERT INTO snapshots(id,user_id,provider,as_of,data) SELECT ?,?,?,?,? WHERE EXISTS(${condition})`,
      sid,
      uid,
      id,
      snapshot.asOf,
      JSON.stringify(snapshot),
      uid,
      id,
      generation,
    ),
    statement(
      `INSERT INTO sync_runs(id,user_id,provider,started_at,duration_ms,success,version) SELECT ?,?,?,?,?,1,? WHERE EXISTS(${condition})`,
      randomToken(),
      uid,
      id,
      now - durationMs,
      durationMs,
      snapshot.version,
      uid,
      id,
      generation,
    ),
    statement(
      "UPDATE connections SET active_snapshot_id=?,status='CONNECTED',error_code=NULL,last_success_at=?,lease_until=NULL,credentials=?,expires_at=? WHERE user_id=? AND id=? AND generation=? AND connected=1",
      sid,
      now,
      encrypt(auth),
      auth.expiresAt ? Date.parse(auth.expiresAt) : null,
      uid,
      id,
      generation,
    ),
  ]);
}
export async function fail(
  id: ProviderId,
  generation: number,
  code: string,
  needsLogin: boolean,
  durationMs: number,
) {
  const uid = userId();
  await db().batch([
    statement(
      "INSERT INTO sync_runs(id,user_id,provider,started_at,duration_ms,success,error_code) SELECT ?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM connections WHERE user_id=? AND id=? AND generation=?)",
      randomToken(),
      uid,
      id,
      Date.now() - durationMs,
      durationMs,
      code,
      uid,
      id,
      generation,
    ),
    statement(
      "UPDATE connections SET status=?,error_code=?,lease_until=NULL WHERE user_id=? AND id=? AND generation=?",
      needsLogin ? "NEEDS_LOGIN" : "ERROR",
      code,
      uid,
      id,
      generation,
    ),
  ]);
}
export async function updateAuthorization(
  id: ProviderId,
  generation: number,
  auth: Authorization,
) {
  await statement(
    "UPDATE connections SET credentials=?,expires_at=? WHERE user_id=? AND id=? AND generation=? AND connected=1",
    encrypt(auth),
    auth.expiresAt ? Date.parse(auth.expiresAt) : null,
    userId(),
    id,
    generation,
  ).run();
}
export async function putRecord(
  kind: string,
  id: string,
  data: unknown,
  seconds: number,
) {
  await statement(
    "INSERT INTO auth_records(id,kind,user_id,data,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at",
    hash(kind + ":" + id),
    kind,
    currentUser(),
    encrypt(data),
    Date.now() + seconds * 1000,
  ).run();
}
export async function record<T>(
  kind: string,
  id: string,
  consume = false,
): Promise<T | null> {
  const row = await statement(
    consume
      ? "DELETE FROM auth_records WHERE id=? AND kind=? AND expires_at>? RETURNING data"
      : "SELECT data FROM auth_records WHERE id=? AND kind=? AND expires_at>?",
    hash(kind + ":" + id),
    kind,
    Date.now(),
  ).first<{ data: string }>();
  return row ? decrypt<T>(row.data) : null;
}
export async function removeRecord(kind: string, id: string) {
  await statement(
    "DELETE FROM auth_records WHERE id=? AND kind=?",
    hash(kind + ":" + id),
    kind,
  ).run();
}
export async function history(start = "0000-00-00", end = "9999-99-99") {
  const { results } = await statement(
    "SELECT day,data FROM daily_snapshots WHERE user_id=? AND day>=? AND day<=? ORDER BY day",
    userId(),
    start,
    end,
  ).all<{ day: string; data: string }>();
  return results.map((r) => ({ day: r.day, ...JSON.parse(r.data) }));
}
export async function dailySnapshot(day: string, data: unknown) {
  await statement(
    "INSERT INTO daily_snapshots(user_id,day,data,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
    userId(),
    day,
    JSON.stringify(data),
    Date.now(),
  ).run();
}
export async function rateLimit(key: string, max: number, seconds: number) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const row = await statement(
    "INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
    hash((currentUser() || "public") + ":" + key + ":" + bucket),
    (bucket + 1) * seconds * 1000,
  ).first<{ count: number }>();
  return Boolean(row && row.count <= max);
}
export async function mcpEpoch() {
  const id = "mcp:" + userId();
  await statement(
    "INSERT INTO security_state(id,epoch) VALUES(?,0) ON CONFLICT DO NOTHING",
    id,
  ).run();
  const row = await statement(
    "SELECT epoch FROM security_state WHERE id=?",
    id,
  ).first<{ epoch: number }>();
  return row!.epoch;
}
export async function revokeMcp() {
  await db().batch([
    statement(
      "INSERT INTO security_state(id,epoch) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET epoch=epoch+1",
      "mcp:" + userId(),
    ),
    statement(
      "DELETE FROM auth_records WHERE user_id=? AND kind IN ('access','refresh','code','consent')",
      userId(),
    ),
  ]);
}
export async function usersForSync() {
  return (
    await statement(
      "SELECT DISTINCT user_id FROM connections WHERE connected=1",
    ).all<{ user_id: string }>()
  ).results.map((r) => r.user_id);
}
export async function cleanupExpired() {
  await db().batch([
    statement("DELETE FROM auth_records WHERE expires_at<=?", Date.now()),
    statement("DELETE FROM rate_limits WHERE expires_at<=?", Date.now()),
  ]);
}
