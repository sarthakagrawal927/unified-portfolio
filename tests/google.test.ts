import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";
import { verifyGoogleToken } from "../src/server/google";
import { userId, withUser } from "../src/server/tenant";
test("Google identity requires signature, issuer, audience, expiry, nonce and verified email", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test" }],
  });
  const token = (extra: Record<string, unknown> = {}) =>
    new SignJWT({
      nonce: "nonce",
      email: "person@example.com",
      email_verified: true,
      ...extra,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://accounts.google.com")
      .setAudience("client")
      .setSubject("google-stable-id")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  const verify = (jwt: string, nonce = "nonce", audience = "client") =>
    verifyGoogleToken(
      jwt,
      nonce,
      audience,
      keys as Parameters<typeof verifyGoogleToken>[3],
    );
  assert.equal((await verify(await token())).userId, "google:google-stable-id");
  await assert.rejects(verify(await token(), "wrong"));
  await assert.rejects(verify(await token(), "nonce", "wrong"));
  await assert.rejects(verify(await token({ email_verified: false })));
  await assert.rejects(verify((await token()).slice(0, -10) + "xxxxxxxxxx"));
  const expired = await new SignJWT({
    nonce: "nonce",
    email: "person@example.com",
    email_verified: true,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://accounts.google.com")
    .setAudience("client")
    .setSubject("id")
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(privateKey);
  await assert.rejects(verify(expired));
});
test("tenant context has no default and stays isolated across concurrent requests", async () => {
  assert.throws(() => userId());
  const results = await Promise.all(
    ["alice", "bob"].map((id) =>
      withUser(id, async () => {
        await Promise.resolve();
        return userId();
      }),
    ),
  );
  assert.deepEqual(results, ["alice", "bob"]);
  assert.throws(() => userId());
});
