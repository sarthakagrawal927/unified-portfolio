import { indmoneyScope } from "../../server/preferences";
import { withUser } from "../../server/tenant";
import { sessionIdentity } from "../../server/auth";
import { googleReady } from "../../server/google";
import { PageTitle } from "../../components/ui";
import { ownerSession } from "../../server/auth";
import { origin, hash } from "../../server/crypto";
import { record } from "../../db/store";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    consent?: string;
    document?: string;
  }>;
}) {
  const q = await searchParams;
  if (q.document === "privacy")
    return (
      <section className="panel">
        <h1>Privacy policy</h1>
        <p>
          Updated September 12, 2026. Unified Portfolio is operated by Sarthak
          Agrawal. Contact:{" "}
          <a href="mailto:sarthakagrawal927@gmail.com">
            sarthakagrawal927@gmail.com
          </a>
          .
        </p>
        <h2>Information and purpose</h2>
        <p>
          Google sign-in requests basic profile, email and identity information
          to authenticate you. We retain your verified Google identifier and
          email in an encrypted session. We do not request Gmail, Drive or
          contacts access, and do not retain Google access tokens.
        </p>
        <p>
          When you connect a supported broker, we store its authorization
          encrypted server-side and retain normalized investment observations to
          display your portfolio and history. Connection and sync records help
          diagnose failures.
        </p>
        <h2>Storage and sharing</h2>
        <p>
          Cloudflare Workers and D1 host and process this information. Google
          and connected brokers process authentication under their own policies.
          Other users cannot access your workspace. We do not sell your data or
          use it for advertising.
        </p>
        <p>
          An AI client receives read-only portfolio information only after you
          authorize its MCP access. That client's own privacy policy applies to
          information it receives. You can revoke MCP access in Settings.
        </p>
        <h2>Retention and control</h2>
        <p>
          Sessions expire after 12 hours. Signing out invalidates your session.
          Disconnecting a broker removes its local credentials; historical
          observations remain. Contact the email above to request deletion of
          retained account and portfolio data. We may need to verify your
          identity before handling that request.
        </p>
        <p>
          Essential secure cookies maintain authentication. No advertising
          analytics are enabled. Policy changes will be published here with an
          updated date.
        </p>
        <a href="/settings">Back to sign-in and settings</a>
      </section>
    );
  const session = await ownerSession();
  const ready = googleReady();
  const identity = await sessionIdentity();
  const scope = identity
    ? await withUser(identity.userId, () => indmoneyScope())
    : "ALL";
  const consent =
    q.consent && session
      ? await record<{ clientName: string; redirect: string; owner: string }>(
          "consent",
          q.consent,
        )
      : null;
  return (
    <>
      <PageTitle
        title="Your private workspace"
        description="Control access to your investment information."
      />
      {q.notice && (
        <div className="notice" role="status">
          {q.notice}
        </div>
      )}
      {!session ? (
        <section className="panel login">
          <h2>Sign in with Google</h2>
          <p>
            Your portfolio is private. Sign in to view or connect investments.
          </p>
          <p>
            <a href="/settings?document=privacy">Privacy policy</a>
          </p>
          {ready ? (
            <form action="/api/auth/google/start" method="post">
              <button className="button">Continue with Google</button>
              <p className="footnote">
                Your account has its own private portfolio. Other people cannot
                see your investments.
              </p>
            </form>
          ) : (
            <div className="notice">
              Private server setup is not complete. The operator must configure
              storage, encryption and Google sign-in before live access is
              enabled.
            </div>
          )}
        </section>
      ) : (
        <>
          {consent && consent.owner === hash(session) && (
            <section className="panel consent">
              <h2>Allow {consent.clientName} to read your portfolio?</h2>
              <p>
                This grants access to totals, holdings, allocations, history and
                connection health. It cannot trade or move money.
              </p>
              <p>
                Return address: <code>{consent.redirect}</code>
              </p>
              <form action="/oauth/approve" method="post">
                <input type="hidden" name="consent" value={q.consent} />
                <button className="button" name="decision" value="approve">
                  Allow read-only access
                </button>
                <button
                  className="button secondary"
                  name="decision"
                  value="deny"
                >
                  Deny
                </button>
              </form>
            </section>
          )}
          <section className="panel">
            <h2>INDmoney investments</h2>
            <p>
              Choose what to include from INDmoney. Zerodha remains the source
              for your Indian investments.
            </p>
            <form action="/api/preferences" method="post">
              <label>
                INDmoney scope{" "}
                <select name="indmoneyScope" defaultValue={scope}>
                  <option value="USD">USD investments only</option>
                  <option value="ALL">All INDmoney assets</option>
                </select>
              </label>
              <button className="button secondary">Save INDmoney scope</button>
            </form>
            <p>
              Wallet cash is included when reported. Converted USD estimates are
              labeled; missing cash is never treated as zero.
            </p>
          </section>
          <section className="panel">
            <h2>Ask your portfolio</h2>
            <p>
              Connect an MCP-compatible AI client using this server address.
              Authorize read-only access from this workspace when prompted.
            </p>
            <div className="endpoint">
              <code>{origin()}/mcp</code>
            </div>
            <p className="footnote">
              OAuth with PKCE · Explicit approval · One-hour access tokens
            </p>
            <p>
              Every answer includes source freshness and data coverage. Broker
              credentials are never shared with AI clients. Ask again at any
              time to send the newest successfully stored snapshot; this does
              not refresh an expired broker session.
            </p>
            <div className="endpoint">
              <code>
                Read my latest stored portfolio and state the last sync time for
                every provider before analysing it.
              </code>
            </div>
            <form action="/api/revoke-mcp" method="post">
              <button className="button secondary">
                Revoke all MCP access
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Security & storage</h2>
            <dl className="security-list">
              <div>
                <dt>Provider access</dt>
                <dd>Read-only adapters</dd>
              </div>
              <div>
                <dt>Stored tokens</dt>
                <dd>Server-side, AES-256-GCM encrypted</dd>
              </div>
              <div>
                <dt>Portfolio history</dt>
                <dd>Retained after disconnect</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>Private Google session</dd>
              </div>
            </dl>
            <form action="/api/logout" method="post">
              <button className="button secondary">Sign out</button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
