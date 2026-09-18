import { includeIndmoneyWallet } from "./cash";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProviderError, type PortfolioProvider } from "../../core/model";
import { authorize, endpoint, safeFetch } from "./oauth";
import {
  assetTypes,
  normalizeCategory,
  normalizeIndmoney,
  unpack,
  type Category,
} from "./normalize";
import { record, putRecord, removeRecord } from "../../db/store";
import { indmoneyScope } from "../../server/preferences";
import { userId } from "../../server/tenant";
import { origin } from "../../server/crypto";
export function createIndmoneyClient() {
  return new Client(
    { name: "unified-portfolio", version: "0.1.0" },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
}
export const indmoney: PortfolioProvider = {
  id: "indmoney",
  async connect(state, callback) {
    const { client, result } = await authorize(callback, state, {});
    if (result !== "REDIRECT") throw new ProviderError("UPSTREAM_ERROR");
    return { url: client.url(), context: client.context() };
  },
  async exchange(params, callback, context) {
    const code = params.get("code");
    if (!code) throw new ProviderError("SESSION_EXPIRED", true);
    const { client, result } = await authorize(callback, "", context, code);
    if (result !== "AUTHORIZED")
      throw new ProviderError("SESSION_EXPIRED", true);
    return client.authorization();
  },
  async refresh(auth) {
    const { client, result } = await authorize(
      origin() + "/api/providers/indmoney/callback",
      "",
      auth.metadata || {},
      undefined,
      auth,
    );
    if (result !== "AUTHORIZED")
      throw new ProviderError("SESSION_EXPIRED", true);
    return client.authorization();
  },
  async fetch(auth) {
    const client = createIndmoneyClient();
    let stage = "INITIALIZE";
    let httpStatus = 0;
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(endpoint), {
          requestInit: {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
          },
          fetch: async (input, init) => {
            const response = await safeFetch(input, init);
            httpStatus = response.status;
            return response;
          },
        }),
      );
      stage = "TOOLS";
      const { tools } = await client.listTools();
      if (!tools.some((t) => t.name === "networth_holdings"))
        throw new ProviderError("INDMONEY_SCHEMA");
      const scope = await indmoneyScope();
      const requested = scope === "USD" ? ["US_STOCK" as const] : assetTypes;
      const key =
        scope +
        ":" +
        userId() +
        ":indmoney:" +
        String(
          (auth.metadata?.client as { client_id?: string })?.client_id ||
            "default",
        );
      const staged = (await record<{
        categories: Category[];
        retryAt?: number;
      }>("indmoney-import", key)) || { categories: [] };
      if (staged.retryAt && staged.retryAt > Date.now())
        throw new ProviderError(
          `RATE_LIMIT:${staged.retryAt}:${staged.categories.length}:${requested.length}`,
        );
      const started = Date.now();
      for (const type of requested) {
        if (staged.categories.some((c) => c.type === type)) continue;
        if (Date.now() - started > 75000)
          throw new ProviderError("INDMONEY_CONTINUE");
        stage = "HOLDINGS";
        try {
          const result = await client.callTool({
            name: "networth_holdings",
            arguments: { asset_type: type },
          });
          const category = {
            type,
            data: unpack(result),
            asOf: new Date().toISOString(),
          };
          normalizeCategory(category);
          staged.categories.push(category);
          staged.retryAt = undefined;
          await putRecord("indmoney-import", key, staged, 86400);
        } catch (error) {
          if (error instanceof ProviderError && error.code === "RATE_LIMIT") {
            staged.retryAt =
              Date.now() + (error.retryAfterSeconds || 60) * 1000;
            await putRecord("indmoney-import", key, staged, 86400);
            throw new ProviderError(
              `RATE_LIMIT:${staged.retryAt}:${staged.categories.length}:${requested.length}`,
            );
          }
          throw error;
        }
      }
      const snapshot = normalizeIndmoney(staged.categories, requested);
      const us = staged.categories.find((c) => c.type === "US_STOCK");
      if (us)
        includeIndmoneyWallet(
          snapshot,
          unpack(
            await client.callTool({ name: "networth_snapshot", arguments: {} }),
          ),
          us.data,
          new Date().toISOString(),
        );
      await removeRecord("indmoney-import", key);
      return snapshot;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (
        error instanceof UnauthorizedError ||
        (error instanceof StreamableHTTPError &&
          [401, 403].includes(error.code || 0))
      )
        throw new ProviderError("SESSION_EXPIRED", true);
      if (error instanceof StreamableHTTPError && error.code === 429)
        throw new ProviderError("RATE_LIMIT");
      const code =
        typeof (error as { code?: unknown })?.code === "number"
          ? (error as { code: number }).code
          : 0;
      throw new ProviderError(
        `INDMONEY_${stage}_HTTP_${httpStatus}_RPC_${code}`,
      );
    } finally {
      await client.close();
    }
  },
};
