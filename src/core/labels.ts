import type { Connection, ProviderId, Snapshot } from "./model";
export type OwnerLabels = Partial<Record<ProviderId, string>>;
export function labeledPortfolio(
  snapshots: Snapshot[],
  connections: Connection[],
  labels: OwnerLabels,
  owner?: string,
) {
  const ownerLabel = (id: ProviderId) => labels[id] || "Unlabeled";
  const selected = (id: ProviderId) =>
    !owner || ownerLabel(id).toLocaleLowerCase() === owner.toLocaleLowerCase();
  return {
    connections: connections
      .filter((c) => selected(c.id))
      .map((c) => ({ ...c, ownerLabel: ownerLabel(c.id) })),
    snapshots: snapshots
      .filter((s) => selected(s.provider))
      .map((s) => ({
        ...s,
        holdings: s.holdings.map((h) => ({
          ...h,
          ownerLabel: ownerLabel(s.provider),
        })),
      })),
  };
}
