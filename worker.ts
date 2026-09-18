import handler from "vinext/server/fetch-handler";
import { databaseConfigured, withDatabase } from "./src/db/store";
import { runScheduledSync } from "./src/server/jobs";
type Env = { DB: D1Database };
export default {
  async fetch(request: Request, env: Env) {
    return withDatabase(env.DB, async () => {
      const response = await handler.fetch(request);
      // Complete SSR within the same request-scoped D1 session.
      const body = response.body ? await response.arrayBuffer() : null;
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      // Normal form POSTs need their real Origin for strict CSRF checks.
      // Auth/API responses never forward callback URLs as referrers.
      headers.set(
        "Referrer-Policy",
        new URL(request.url).pathname.startsWith("/api/") ||
          new URL(request.url).pathname.startsWith("/oauth/")
          ? "no-referrer"
          : "same-origin",
      );
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  },
  async scheduled(_event: unknown, env: Env) {
    await withDatabase(env.DB, async () => {
      if (databaseConfigured()) await runScheduledSync();
    });
  },
};
