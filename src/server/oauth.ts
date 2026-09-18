import { withUser, userId } from "./tenant";
import { z } from "zod";
import { origin, randomToken, hash } from "./crypto";
import { putRecord, record, removeRecord, mcpEpoch } from "../db/store";
import { ownerSession, sessionIdentity, sameOrigin, noStore } from "./auth";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: noStore });
const Client = z.object({
  client_name: z.string().min(1).max(80),
  redirect_uris: z.array(z.string().url()).min(1).max(5),
  token_endpoint_auth_method: z.literal("none").default("none"),
});
type ClientData = z.infer<typeof Client>;
export function metadata() {
  return {
    issuer: origin(),
    authorization_endpoint: origin() + "/oauth/authorize",
    token_endpoint: origin() + "/oauth/token",
    registration_endpoint: origin() + "/oauth/register",
    revocation_endpoint: origin() + "/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["portfolio:read"],
  };
}
export type Grant = {
  userId: string;
  epoch: number;
  clientId: string;
  redirect: string;
  challenge: string;
  resource: string;
  scope: string;
};
export async function oauth(request: Request, action: string) {
  if (action === "authorize" || action === "approve") {
    const session = await sessionIdentity();
    if (!session)
      return Response.redirect(
        origin() + "/settings?notice=Sign+in+then+retry+the+MCP+connection",
        303,
      );
    return withUser(session.userId, () => oauthAction(request, action));
  }
  return oauthAction(request, action);
}
async function oauthAction(request: Request, action: string) {
  if (action === "register" && request.method === "POST") {
    const client = Client.parse(await request.json());
    if (
      client.redirect_uris.some((u) => {
        const v = new URL(u);
        return v.protocol !== "https:" || v.hash || v.username || v.password;
      })
    )
      return json({ error: "invalid_redirect_uri" }, 400);
    const clientId = randomToken();
    await putRecord("client", clientId, client, 365 * 86400);
    return json(
      {
        ...client,
        client_id: clientId,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  }
  if (action === "authorize" && request.method === "GET") {
    if (!(await ownerSession()))
      return Response.redirect(
        origin() + "/settings?notice=Sign+in+then+retry+the+MCP+connection",
        303,
      );
    const q = new URL(request.url).searchParams;
    const clientId = q.get("client_id") || "";
    const client = await record<ClientData>("client", clientId);
    const redirect = q.get("redirect_uri") || "";
    if (
      !client?.redirect_uris.includes(redirect) ||
      q.get("response_type") !== "code" ||
      q.get("code_challenge_method") !== "S256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(q.get("code_challenge") || "") ||
      q.get("resource") !== origin() + "/mcp" ||
      (q.get("scope") || "portfolio:read") !== "portfolio:read"
    )
      return json({ error: "invalid_request" }, 400);
    const consent = randomToken();
    await putRecord(
      "consent",
      consent,
      {
        userId: userId(),
        epoch: await mcpEpoch(),
        clientName: client.client_name,
        clientId,
        redirect,
        challenge: q.get("code_challenge"),
        state: q.get("state"),
        resource: q.get("resource"),
        scope: "portfolio:read",
        owner: hash((await ownerSession())!),
      },
      300,
    );
    return Response.redirect(origin() + "/settings?consent=" + consent, 303);
  }
  if (action === "approve" && request.method === "POST") {
    const owner = await ownerSession();
    if (!owner || !sameOrigin(request))
      return json({ error: "unauthorized" }, 401);
    const form = await request.formData();
    const grant = await record<Grant & { state: string; owner: string }>(
      "consent",
      String(form.get("consent")),
      true,
    );
    if (!grant || grant.owner !== hash(owner))
      return json({ error: "invalid_request" }, 400);
    const target = new URL(grant.redirect);
    if (form.get("decision") !== "approve") {
      target.searchParams.set("error", "access_denied");
    } else {
      const code = randomToken();
      await putRecord("code", code, grant, 60);
      target.searchParams.set("code", code);
    }
    if (grant.state) target.searchParams.set("state", grant.state);
    return Response.redirect(target.href, 303);
  }
  if (action === "token" && request.method === "POST") {
    const form = new URLSearchParams(await request.text());
    const kind = form.get("grant_type");
    let grant: Grant | null = null;
    if (kind === "authorization_code") {
      grant = await record<Grant>("code", form.get("code") || "", true);
      if (
        !grant ||
        grant.redirect !== form.get("redirect_uri") ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(form.get("code_verifier") || "") ||
        hash(form.get("code_verifier") || "") !== grant.challenge
      )
        return json({ error: "invalid_grant" }, 400);
    } else if (kind === "refresh_token") {
      grant = await record<Grant>(
        "refresh",
        form.get("refresh_token") || "",
        true,
      );
    }
    if (
      !grant ||
      !grant.userId ||
      grant.epoch !== (await withUser(grant.userId, () => mcpEpoch())) ||
      grant.clientId !== form.get("client_id") ||
      grant.resource !== form.get("resource")
    )
      return json({ error: "invalid_grant" }, 400);
    const access = randomToken(),
      refresh = randomToken();
    await withUser(grant.userId, async () => {
      await putRecord("access", access, grant, 3600);
      await putRecord("refresh", refresh, grant, 30 * 86400);
    });
    return json({
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "portfolio:read",
    });
  }
  if (action === "revoke" && request.method === "POST") {
    const form = new URLSearchParams(await request.text());
    const token = form.get("token") || "";
    await removeRecord("access", token);
    await removeRecord("refresh", token);
    return json({});
  }
  return json({ error: "unsupported_request" }, 400);
}
