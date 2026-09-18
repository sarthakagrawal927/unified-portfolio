import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { OAuthError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { ProviderError, type Authorization } from "../../core/model";
export const endpoint = "https://mcp.indmoney.com/mcp";
export const safeFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "indmoney.com" || url.hostname.endsWith(".indmoney.com"))
  )
    throw new ProviderError("UPSTREAM_ERROR");
  const response = await fetch(input, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status >= 300 && response.status < 400)
    throw new ProviderError("UPSTREAM_ERROR");
  return response;
};
export function oauthClient(
  callback: string,
  state: string,
  context: Record<string, unknown> = {},
  authorization?: Authorization,
) {
  let redirect = "";
  const saved = { ...context };
  let tokens = authorization
    ? {
        access_token: authorization.accessToken,
        refresh_token: authorization.refreshToken,
        token_type: "Bearer",
      }
    : (undefined as OAuthTokens | undefined);
  const provider: OAuthClientProvider = {
    redirectUrl: callback,
    clientMetadata: {
      client_name: "Unified Portfolio",
      redirect_uris: [callback],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    state: () => state,
    clientInformation: () =>
      saved.client as OAuthClientInformationMixed | undefined,
    saveClientInformation: (client) => {
      saved.client = client;
    },
    tokens: () => tokens,
    saveTokens: (value) => {
      tokens = value;
      saved.expiresAt = value.expires_in
        ? new Date(Date.now() + value.expires_in * 1000).toISOString()
        : undefined;
    },
    redirectToAuthorization: (url) => {
      if (
        url.protocol !== "https:" ||
        !(
          url.hostname === "indmoney.com" ||
          url.hostname.endsWith(".indmoney.com")
        )
      )
        throw new ProviderError("UPSTREAM_ERROR");
      redirect = url.href;
    },
    saveCodeVerifier: (value) => {
      saved.verifier = value;
    },
    codeVerifier: () => {
      if (typeof saved.verifier !== "string")
        throw new ProviderError("SESSION_EXPIRED", true);
      return saved.verifier;
    },
  };
  return {
    provider,
    context: () => saved,
    url: () => redirect,
    authorization: (): Authorization => {
      if (!tokens?.access_token)
        throw new ProviderError("SESSION_EXPIRED", true);
      const { verifier, ...metadata } = saved;
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: saved.expiresAt as string | undefined,
        metadata,
      };
    },
  };
}
export async function authorize(
  callback: string,
  state: string,
  context: Record<string, unknown>,
  code?: string,
  authorization?: Authorization,
) {
  const client = oauthClient(callback, state, context, authorization);
  let result;
  try {
    result = await auth(client.provider, {
      serverUrl: endpoint,
      authorizationCode: code,
      fetchFn: safeFetch,
    });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (
      error instanceof OAuthError &&
      ["invalid_grant", "invalid_token", "access_denied"].includes(
        error.errorCode,
      )
    )
      throw new ProviderError("SESSION_EXPIRED", true);
    throw new ProviderError("UPSTREAM_ERROR");
  }
  return { client, result };
}
