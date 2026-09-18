import { zerodha } from "./zerodha";
import { indmoney } from "./indmoney";
import type { ProviderId } from "../core/model";
export const adapters = { zerodha, indmoney };
export function configured(id: ProviderId) {
  return id === "indmoney" || id === "zerodha";
}
