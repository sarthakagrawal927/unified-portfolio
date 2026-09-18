import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const randomToken = () => randomBytes(32).toString("base64url");
export const hash = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
function key() {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k || Buffer.from(k, "base64").length !== 32)
    throw new Error("Server encryption is not configured");
  return Buffer.from(k, "base64");
}
export function encrypt(data: unknown) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    c.update(JSON.stringify(data), "utf8"),
    c.final(),
  ]);
  return [iv, c.getAuthTag(), encrypted]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decrypt<T>(value: string): T {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString());
}
export function origin() {
  const value = process.env.APP_ORIGIN || "http://127.0.0.1:3040";
  const u = new URL(value);
  if (process.env.NODE_ENV === "production" && u.protocol !== "https:")
    throw new Error("HTTPS origin required");
  return u.origin;
}
