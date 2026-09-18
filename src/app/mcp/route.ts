import { withUser } from "../../server/tenant";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcp } from "../../mcp/tools";
import { record, rateLimit, mcpEpoch } from "../../db/store";
import { origin } from "../../server/crypto";
import type { Grant } from "../../server/oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const grant = token ? await record<Grant>("access", token) : null;
    if (
      !grant ||
      !grant.userId ||
      grant.epoch !== (await withUser(grant.userId, () => mcpEpoch())) ||
      grant.resource !== origin() + "/mcp" ||
      grant.scope !== "portfolio:read"
    )
      return new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin()}/.well-known/oauth-protected-resource/mcp"`,
          "Cache-Control": "no-store",
        },
      });
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== origin())
      return new Response("Forbidden", { status: 403 });
    if (!(await withUser(grant.userId, () => rateLimit("mcp", 120, 60))))
      return new Response("Rate limited", { status: 429 });
    const body = await request.text();
    if (body.length > 32768)
      return new Response("Request too large", { status: 413 });
    const server = createMcp(grant.userId);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(
        new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body,
        }),
      );
    } finally {
      await server.close();
    }
  } catch {
    return Response.json(
      { error: "Request could not be completed" },
      { status: 503 },
    );
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
