import { databaseConfigured } from "../db/store";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { hash, origin, randomToken } from "./crypto";
import { cookie, noStore, sameOrigin } from "./auth";
import * as store from "../db/store";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const stateCookie = "portfolio_google_state";
export function googleReady() {
  return Boolean(
    databaseConfigured() &&
    process.env.TOKEN_ENCRYPTION_KEY &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET,
  );
}
export function googleIdentity(payload: JWTPayload, nonce: string) {
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.email !== "string"
  )
    throw new Error("Invalid Google identity");
  return { userId: "google:" + payload.sub, email: payload.email };
}
function stateHeader(value: string, seconds: number) {
  return `${stateCookie}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function readState(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(stateCookie + "="))
      ?.slice(stateCookie.length + 1) || ""
  );
}
export async function googleAuth(request: Request, action: string) {
  const redirectUri = origin() + "/api/auth/google/callback";
  if (!googleReady())
    return Response.json(
      { error: "Google sign-in setup is not complete." },
      { status: 503, headers: noStore },
    );
  if (action === "start" && request.method === "POST") {
    if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
    let stage = "RATE_LIMIT";
    try {
      if (!(await store.rateLimit("google-login", 120, 60)))
        return new Response("Please try again shortly", { status: 429 });
      const state = randomToken(),
        binding = randomToken(),
        nonce = randomToken(),
        verifier = randomToken();
      stage = "STATE_STORAGE";
      await store.putRecord(
        "google-state",
        state,
        { binding: hash(binding), nonce, verifier },
        600,
      );
      stage = "REDIRECT";
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: hash(verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return new Response(null, {
        status: 303,
        headers: {
          Location: url.href,
          "Set-Cookie": stateHeader(binding, 600),
          ...noStore,
        },
      });
    } catch {
      return Response.json(
        {
          error: "Google sign-in is temporarily unavailable.",
          code: "AUTH_" + stage,
        },
        { status: 503, headers: noStore },
      );
    }
  }
  if (action === "callback" && request.method === "GET") {
    let stage = "STATE_READ";
    try {
      const q = new URL(request.url).searchParams;
      const pending = await store.record<{
        binding: string;
        nonce: string;
        verifier: string;
      }>("google-state", q.get("state") || "", true);
      stage = "STATE_BINDING";
      if (
        !pending ||
        pending.binding !== hash(readState(request)) ||
        q.has("error") ||
        !q.get("code")
      )
        throw new Error("Invalid callback");
      stage = "TOKEN_EXCHANGE";
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: q.get("code")!,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: pending.verifier,
        }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const allowed = [
          "invalid_client",
          "invalid_grant",
          "invalid_request",
          "unauthorized_client",
          "unsupported_grant_type",
        ];
        stage =
          failure?.error && allowed.includes(failure.error)
            ? "TOKEN_" + failure.error.toUpperCase()
            : "TOKEN_HTTP_" + response.status;
        throw new Error("Google exchange failed");
      }
      stage = "TOKEN_RESPONSE";
      const tokens = z
        .object({ id_token: z.string() })
        .parse(await response.json());
      stage = "TOKEN_VERIFY";
      const identity = await verifyGoogleToken(
        tokens.id_token,
        pending.nonce,
        process.env.GOOGLE_CLIENT_ID!,
      );
      stage = "SESSION_STORE";
      const session = randomToken();
      await store.putRecord("session", session, identity, 12 * 3600);
      const headers = new Headers({
        Location: origin() + "/accounts",
        ...noStore,
      });
      headers.append("Set-Cookie", cookie(session, 12 * 3600));
      headers.append("Set-Cookie", stateHeader("", 0));
      return new Response(null, { status: 303, headers });
    } catch {
      return new Response(null, {
        status: 303,
        headers: {
          Location:
            origin() +
            "/settings?notice=Google+sign-in+could+not+finish.+Please+try+again.&authError=" +
            stage,
          "Set-Cookie": stateHeader("", 0),
          ...noStore,
        },
      });
    }
  }
  return new Response("Method not allowed", { status: 405 });
}

export async function verifyGoogleToken(
  token: string,
  nonce: string,
  audience: string,
  keys = googleKeys,
) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce", "email"],
  });
  return googleIdentity(payload, nonce);
}
