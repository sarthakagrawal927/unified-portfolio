import { databaseConfigured } from "../db/store";
import { cookies } from "next/headers";
import { record } from "../db/store";
import { origin } from "./crypto";
export const cookieName = "portfolio_session";
export async function sessionIdentity() {
  if (!databaseConfigured()) return null;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await record<{ userId: string }>("session", token);
  return session?.userId ? { token, userId: session.userId } : null;
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === origin();
}
export function cookie(value: string, maxAge: number) {
  return `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function ownerSession() {
  return (await sessionIdentity())?.token || null;
}
