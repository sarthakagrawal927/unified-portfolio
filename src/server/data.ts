import { labeledPortfolio } from "../core/labels";
import { indmoneyScope, ownerLabels } from "./preferences";
import { scopeSnapshots } from "../core/scope";
import { databaseConfigured } from "../db/store";
import { activeProviders, type Connection } from "../core/model";
import { portfolio } from "../core/portfolio";
import * as store from "../db/store";
export async function data(ownerLabel?: string) {
  if (!databaseConfigured()) {
    const connections: Connection[] = activeProviders.map((id) => ({
      id,
      status: "NEEDS_LOGIN",
      connected: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      errorCode: null,
      generation: 0,
      expiresAt: null,
    }));
    return {
      snapshots: [],
      connections,
      current: portfolio([], connections),
      history: [],
      setup: true,
    };
  }
  const rawConnections = await store.connectionList();
  const scope = await indmoneyScope();
  const labels = await ownerLabels();
  const { snapshots, connections } = labeledPortfolio(
    scopeSnapshots(await store.activeSnapshots(), scope),
    rawConnections,
    labels,
    ownerLabel,
  );
  return {
    connections,
    snapshots,
    current: { ...portfolio(snapshots, connections), indmoneyScope: scope },
    history: (await store.history()).filter(
      (h) => !ownerLabel && (h.indmoneyScope || "ALL") === scope,
    ) as (ReturnType<typeof portfolio> & {
      day: string;
    })[],
    setup: false,
  };
}
