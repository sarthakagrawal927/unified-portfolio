import { origin } from "../../../../server/crypto";
export async function GET() {
  return Response.json({
    resource: origin() + "/mcp",
    authorization_servers: [origin()],
    scopes_supported: ["portfolio:read"],
    bearer_methods_supported: ["header"],
  });
}
