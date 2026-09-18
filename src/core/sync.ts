import { SnapshotSchema, ProviderError, type PortfolioProvider } from "./model";
import * as store from "../db/store";
export type SyncStore = Pick<
  typeof store,
  "acquire" | "publish" | "fail" | "updateAuthorization"
>;
export async function sync(
  provider: PortfolioProvider,
  repository: SyncStore = store,
) {
  const lease = await repository.acquire(provider.id);
  if (!lease) return { status: "skipped" };
  const start = Date.now();
  let auth = lease.auth;
  try {
    if (auth.expiresAt && Date.parse(auth.expiresAt) <= Date.now()) {
      auth = await provider.refresh(auth);
      await repository.updateAuthorization(provider.id, lease.generation, auth);
    }
    let raw;
    try {
      raw = await provider.fetch(auth);
    } catch (error) {
      if (
        error instanceof ProviderError &&
        error.needsLogin &&
        auth.refreshToken
      ) {
        auth = await provider.refresh(auth);
        await repository.updateAuthorization(
          provider.id,
          lease.generation,
          auth,
        );
        raw = await provider.fetch(auth);
      } else throw error;
    }
    const snapshot = SnapshotSchema.parse(raw);
    if (snapshot.provider !== provider.id)
      throw new ProviderError("INVALID_PAYLOAD");
    const accounts = new Set(snapshot.accounts.map((a) => a.id));
    const rows = [...snapshot.holdings, ...snapshot.positions];
    if (
      rows.some(
        (h) => h.source !== provider.id || !accounts.has(h.accountId),
      ) ||
      snapshot.cash.some((c) => !accounts.has(c.accountId))
    )
      throw new ProviderError("INVALID_PAYLOAD");
    const keys = snapshot.holdings.map((h) =>
      [h.accountId, h.instrumentId, h.exchange, h.currency].join(":"),
    );
    if (new Set(keys).size !== keys.length)
      throw new ProviderError("INVALID_PAYLOAD");
    await repository.publish(
      provider.id,
      lease.generation,
      snapshot,
      auth,
      Date.now() - start,
    );
    return { status: "success" };
  } catch (error) {
    const known = error instanceof ProviderError;
    const code = known ? error.code : "INVALID_PAYLOAD";
    await repository.fail(
      provider.id,
      lease.generation,
      code,
      known && error.needsLogin,
      Date.now() - start,
    );
    return { status: "failed", code };
  }
}
