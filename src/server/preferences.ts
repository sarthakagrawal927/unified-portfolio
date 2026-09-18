import { record, putRecord } from "../db/store";
import { userId } from "./tenant";
import type { IndmoneyScope } from "../core/scope";
export async function indmoneyScope(): Promise<IndmoneyScope> {
  const value = await record<{ indmoneyScope: IndmoneyScope }>(
    "preferences",
    userId(),
  );
  return value?.indmoneyScope === "USD" ? "USD" : "ALL";
}
export async function saveIndmoneyScope(value: IndmoneyScope) {
  await putRecord(
    "preferences",
    userId(),
    { indmoneyScope: value },
    10 * 365 * 86400,
  );
}

export async function ownerLabels() {
  return (
    (await record<import("../core/labels").OwnerLabels>(
      "portfolio-labels",
      userId(),
    )) || {}
  );
}
export async function saveOwnerLabels(
  labels: import("../core/labels").OwnerLabels,
) {
  await putRecord("portfolio-labels", userId(), labels, 10 * 365 * 86400);
}
