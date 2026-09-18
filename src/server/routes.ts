import { saveIndmoneyScope, saveOwnerLabels } from "./preferences";
import { googleAuth } from "./google";
import { withUser, userId } from "./tenant";
import { z } from "zod";
import { adapters } from "../providers";
import { activeProviders, ProviderError } from "../core/model";
import { sync } from "../core/sync";
import * as store from "../db/store";
import { sessionIdentity, sameOrigin, cookie, noStore } from "./auth";
import { origin, randomToken, hash } from "./crypto";
const redirect = (notice: string) =>
  Response.redirect(
    origin() + "/accounts?notice=" + encodeURIComponent(notice),
    303,
  );
export async function api(request: Request, parts: string[]) {
  try {
    if (parts[0] === "auth" && parts[1] === "google")
      return googleAuth(request, parts[2]);
    if (
      request.method !== "POST" &&
      !(request.method === "GET" && parts[2] === "callback")
    )
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    const identity = await sessionIdentity();
    if (!identity) return new Response("Sign in first", { status: 401 });
    const session = identity.token;
    return await withUser(identity.userId, async () => {
      if (parts[0] === "portfolio-labels") {
        if (!sameOrigin(request))
          return new Response("Forbidden", { status: 403 });
        const form = await request.formData();
        const label = z.string().trim().min(1).max(40);
        await saveOwnerLabels({
          zerodha: label.parse(form.get("zerodha")),
          indmoney: label.parse(form.get("indmoney")),
        });
        return redirect("Portfolio labels saved.");
      }
      if (parts[0] === "preferences") {
        if (!sameOrigin(request))
          return new Response("Forbidden", { status: 403 });
        const form = await request.formData();
        await saveIndmoneyScope(
          z.enum(["ALL", "USD"]).parse(form.get("indmoneyScope")),
        );
        return Response.redirect(
          origin() + "/settings?notice=INDmoney+scope+saved",
          303,
        );
      }
      if (parts[0] === "logout") {
        if (!sameOrigin(request))
          return new Response("Forbidden", { status: 403 });
        await store.removeRecord("session", session);
        return new Response(null, {
          status: 303,
          headers: {
            Location: origin() + "/settings",
            "Set-Cookie": cookie("", 0),
          },
        });
      }
      if (parts[0] === "revoke-mcp") {
        if (!sameOrigin(request))
          return new Response("Forbidden", { status: 403 });
        await store.revokeMcp();
        return Response.redirect(
          origin() + "/settings?notice=All+MCP+access+revoked",
          303,
        );
      }
      if (parts[0] !== "providers")
        return new Response("Not found", { status: 404 });
      if (!activeProviders.some((id) => id === parts[1]))
        return new Response("Not found", { status: 404 });
      const id = z.enum(activeProviders).parse(parts[1]);
      const action = parts[2];
      const callback = origin() + `/api/providers/${id}/callback`;
      if (action === "callback") {
        const q = new URL(request.url).searchParams;
        const state = q.get("state") || "";
        const stored = await store.record<{
          provider: string;
          session: string;
          generation: number;
          context: Record<string, unknown>;
        }>("broker-state", state, true);
        if (
          !stored ||
          stored.provider !== id ||
          stored.session !== hash(session)
        )
          return redirect("Connection expired. Please connect again.");
        if (q.has("error"))
          return redirect(
            "Connection was not approved. Your previous portfolio is safe.",
          );
        const auth = await adapters[id].exchange(q, callback, stored.context);
        if (!(await store.saveAuthorization(id, auth, stored.generation)))
          return redirect(
            "Connection changed while signing in. Please try again.",
          );
        await sync(adapters[id]);
        return redirect("Connection checked. See account health below.");
      }
      if (!sameOrigin(request))
        return new Response("Forbidden", { status: 403 });
      const kitePendingKey = userId() + ":" + hash(session);
      if (id === "zerodha" && action === "finish") {
        const pending = await store.record<{
          context: Record<string, unknown>;
          generation: number;
        }>("kite-pending", kitePendingKey);
        if (!pending)
          return redirect("Zerodha login expired. Please connect again.");
        try {
          const auth = await adapters.zerodha.exchange(
            new URLSearchParams(),
            callback,
            pending.context,
          );
          if (!(await store.saveAuthorization(id, auth, pending.generation)))
            return redirect(
              "Connection changed. Please start Zerodha login again.",
            );
          await store.removeRecord("kite-pending", kitePendingKey);
          const result = await sync(adapters.zerodha);
          return redirect(
            result.status === "success"
              ? "Zerodha connected and portfolio refreshed."
              : "Zerodha connected. Import needs attention; see account health below.",
          );
        } catch (error) {
          if (error instanceof ProviderError && error.needsLogin)
            return redirect(
              "Complete Zerodha login in the other tab, then choose Finish Zerodha connection. If the session expired, connect again.",
            );
          throw error;
        }
      }
      if (action === "connect") {
        if (!(await store.rateLimit("connect:" + id, 3, 60)))
          return redirect("Please wait a minute before connecting again.");
        const state = randomToken();
        const connection = (await store.connectionList()).find(
          (c) => c.id === id,
        )!;
        const result = await adapters[id].connect(state, callback);
        if (id === "zerodha") {
          await store.putRecord(
            "kite-pending",
            kitePendingKey,
            { context: result.context, generation: connection.generation },
            600,
          );
          return Response.redirect(result.url, 303);
        }
        await store.putRecord(
          "broker-state",
          state,
          {
            provider: id,
            session: hash(session),
            generation: connection.generation,
            context: result.context || {},
          },
          600,
        );
        return Response.redirect(result.url, 303);
      }
      if (action === "refresh") {
        if (!(await store.rateLimit("refresh:" + id, 1, 60)))
          return redirect("Please wait a minute before refreshing again.");
        const result = await sync(adapters[id]);
        return redirect(
          result.status === "success"
            ? "Portfolio refreshed successfully."
            : result.status === "skipped"
              ? "Refresh is already running, or this account needs to be connected."
              : "Refresh failed. No new portfolio data was saved. See account details below.",
        );
      }
      if (action === "disconnect") {
        if (id === "zerodha")
          await store.removeRecord("kite-pending", kitePendingKey);
        await store.disconnect(id);
        return redirect(
          "Disconnected. Access credentials removed; portfolio history retained.",
        );
      }
      return new Response("Not found", { status: 404 });
    });
  } catch (error) {
    return redirect(
      error instanceof ProviderError
        ? /^KITE_[A-Z]+_HTTP_\d+$/.test(error.code)
          ? `Zerodha could not complete the connection (${error.code}). Your previous portfolio is safe.`
          : error.code === "NOT_CONFIGURED"
            ? "This provider needs server setup before it can connect."
            : "The provider could not complete the connection. Please retry."
        : "The request could not finish. Previous portfolio data is safe.",
    );
  }
}
