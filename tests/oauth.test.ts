import { testDatabase } from "./d1";
import { withUser } from "../src/server/tenant";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../src/db/store";
import { oauth, type Grant } from "../src/server/oauth";
import { hash } from "../src/server/crypto";
test("OAuth code exchange enforces PKCE, resource, rotation and owner revocation epoch", async () =>
  withUser("test-user", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    Object.assign(process.env, { APP_ORIGIN: "https://portfolio.test" });
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    const pg = await testDatabase();
    store.setDatabaseForTests(pg.db);
    const request = (body: Record<string, string>) =>
      new Request("https://portfolio.test/oauth/token", {
        method: "POST",
        body: new URLSearchParams(body),
      });
    try {
      const verifier = "a".repeat(43);
      const grant: Grant = {
        userId: "test-user",
        epoch: await store.mcpEpoch(),
        clientId: "test-client",
        redirect: "https://client.test/callback",
        challenge: hash(verifier),
        resource: "https://portfolio.test/mcp",
        scope: "portfolio:read",
      };
      const params = {
        grant_type: "authorization_code",
        client_id: grant.clientId,
        redirect_uri: grant.redirect,
        resource: grant.resource,
        code_verifier: verifier,
      };
      await store.putRecord("code", "wrong", grant, 60);
      assert.equal(
        (
          await oauth(
            request({
              ...params,
              code: "wrong",
              code_verifier: "b".repeat(43),
            }),
            "token",
          )
        ).status,
        400,
      );
      await store.putRecord("code", "valid", grant, 60);
      const response = await oauth(
        request({ ...params, code: "valid" }),
        "token",
      );
      assert.equal(response.status, 200);
      const tokens = (await response.json()) as {
        access_token: string;
        refresh_token: string;
      };
      assert.equal(
        (await store.record<Grant>("access", tokens.access_token))?.scope,
        "portfolio:read",
      );
      assert.equal(
        (await oauth(request({ ...params, code: "valid" }), "token")).status,
        400,
      );
      const refresh = {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: grant.clientId,
        resource: grant.resource,
      };
      assert.equal((await oauth(request(refresh), "token")).status, 200);
      assert.equal((await oauth(request(refresh), "token")).status, 400);
      await store.putRecord("code", "pre-revoke", grant, 60);
      await store.revokeMcp();
      await store.putRecord("code", "late-inflight", grant, 60);
      assert.equal(
        (await oauth(request({ ...params, code: "late-inflight" }), "token"))
          .status,
        400,
      );
      assert.equal(await store.record("access", tokens.access_token), null);
      const unsafe = new Request("https://portfolio.test/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Bad",
          redirect_uris: ["http://localhost/callback"],
        }),
      });
      assert.equal((await oauth(unsafe, "register")).status, 400);
    } finally {
      await pg.close();
      store.setDatabaseForTests(undefined);
    }
  }));
