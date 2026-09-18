import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<string>();
export function userId() {
  const id = context.getStore();
  if (!id) throw new Error("Authenticated user context required");
  return id;
}
export function withUser<T>(id: string, run: () => T): T {
  if (!id || id.length > 255) throw new Error("Invalid user context");
  return context.run(id, run);
}
export function currentUser() {
  return context.getStore() || null;
}
