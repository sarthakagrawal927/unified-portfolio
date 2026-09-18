import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { ProviderError } from "../../core/model";

export const endpoint = "https://mcp.kite.trade/mcp";
const reads = new Set([
  "get_profile",
  "get_holdings",
  "get_mf_holdings",
  "get_margins",
]);
export function assertReadTool(name: string) {
  if (!reads.has(name)) throw new ProviderError("FORBIDDEN_TOOL");
}
export function loginUrl(text: string) {
  const candidates = text.match(/https:\/\/[^\s<>"\)]+/g) || [];
  const urls = [...new Set(candidates)];
  if (urls.length !== 1) throw new ProviderError("INVALID_PAYLOAD");
  const url = new URL(urls[0]);
  if (
    url.origin !== "https://mcp.kite.trade" ||
    url.pathname !== "/authorize" ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("session_id") ||
    [...url.searchParams.keys()].some((k) => k !== "session_id")
  )
    throw new ProviderError("INVALID_PAYLOAD");
  return url.href;
}
export function resultText(result: unknown) {
  const r = result as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
  };
  const text =
    r.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n") || "";
  if (r.isError) {
    const expired = /log.?in|session|token|authenticate/i.test(text);
    throw new ProviderError(
      expired ? "SESSION_EXPIRED" : "UPSTREAM_ERROR",
      expired,
    );
  }
  if (!text) throw new ProviderError("INVALID_PAYLOAD");
  return text;
}
export async function openKite(sessionId?: string) {
  let phase = "INITIALIZE",
    httpStatus = 0;
  const client = new Client(
    { name: "unified-portfolio", version: "0.1.0" },
    {
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    },
  );
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    sessionId,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.href !== endpoint) throw new ProviderError("INVALID_PAYLOAD");
      const response = await fetch(input, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
      });
      httpStatus = response.status;
      if (response.status >= 300 && response.status < 400)
        throw new ProviderError("INVALID_PAYLOAD");
      return response;
    },
  });
  const guard = (e: unknown): never => {
    if (e instanceof ProviderError) throw e;
    if (
      e instanceof StreamableHTTPError &&
      [400, 401, 403, 404].includes(e.code || 0)
    )
      throw new ProviderError("SESSION_EXPIRED", true);
    throw new ProviderError(`KITE_${phase}_HTTP_${httpStatus}`);
  };
  try {
    await client.connect(transport);
  } catch (e) {
    await client.close();
    guard(e);
  }
  return {
    sessionId: () => transport.sessionId,
    async login() {
      phase = "LOGIN";
      try {
        return loginUrl(
          resultText(await client.callTool({ name: "login", arguments: {} })),
        );
      } catch (e) {
        return guard(e);
      }
    },
    async read(name: string): Promise<unknown> {
      phase = "READ";
      assertReadTool(name);
      try {
        const result = await client.callTool({ name, arguments: {} });
        // Kite returns the same generic profile error for an unauthenticated or expired session.
        if (name === "get_profile" && result.isError)
          throw new ProviderError("SESSION_EXPIRED", true);
        return JSON.parse(resultText(result));
      } catch (e) {
        return guard(e);
      }
    },
    close: () => client.close(),
  };
}
