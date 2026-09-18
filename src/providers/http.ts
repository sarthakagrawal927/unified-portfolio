import { ProviderError } from "../core/model";
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new ProviderError("NOT_CONFIGURED");
  return value;
}
export async function jsonRequest(url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderError("UPSTREAM_ERROR");
  }
  if (response.status === 401 || response.status === 403)
    throw new ProviderError("SESSION_EXPIRED", true);
  if (response.status === 429) throw new ProviderError("RATE_LIMIT");
  if (!response.ok) throw new ProviderError("UPSTREAM_ERROR");
  try {
    return (await response.json()) as Record<string, any>;
  } catch {
    throw new ProviderError("INVALID_PAYLOAD");
  }
}
export function istExpiry(hour: number, now = new Date()) {
  const shifted = new Date(now.getTime() + 330 * 60_000);
  shifted.setUTCHours(hour, 0, 0, 0);
  if (shifted.getTime() - 330 * 60_000 <= now.getTime())
    shifted.setUTCDate(shifted.getUTCDate() + 1);
  return new Date(shifted.getTime() - 330 * 60_000).toISOString();
}
