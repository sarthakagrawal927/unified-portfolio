import { view } from "../../server/view";
import {
  PageTitle,
  Health,
  ProviderAction,
  names,
  age,
  syncDate,
} from "../../components/ui";
import { messages } from "../../core/model";
import { configured } from "../../providers";
import { ConnectAccount } from "../../components/connect-account";
export default async function Accounts({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const d = await view();
  const q = await searchParams;
  return (
    <>
      <PageTitle
        title="Connected to the source"
        description="Your accounts stay independent. Your portfolio stays together."
      >
        <Health portfolio={d.current} />
      </PageTitle>
      {q.notice && (
        <div className="notice" role="status">
          {q.notice}
        </div>
      )}
      {d.setup && (
        <div className="notice">
          Your private installation needs setup before live accounts can
          connect. Choose a broker below to see the connection steps.
        </div>
      )}
      <div className="account-list">
        {d.connections.map((c) => {
          const ready = !d.setup && configured(c.id);
          return (
            <section className="account" key={c.id}>
              <div className="account-top">
                <span className={`broker-logo large ${c.id}`}>
                  {names[c.id][0]}
                </span>
                <div>
                  <h2>{names[c.id]}</h2>
                  <small>{c.ownerLabel || "Unlabeled"}</small>
                  <p>
                    {c.id === "zerodha"
                      ? "Indian investments"
                      : "USD investments and wallet cash"}
                  </p>
                </div>
                <span
                  className={`status ${c.status !== "CONNECTED" ? "warn" : ""}`}
                >
                  {!c.connected
                    ? "Not connected"
                    : c.status === "NEEDS_LOGIN"
                      ? "Login required"
                      : c.status === "SYNCING"
                        ? "Refreshing"
                        : c.errorCode === "INDMONEY_IMPORT_PENDING"
                          ? "Connected · import pending"
                          : c.status === "ERROR"
                            ? "Needs attention"
                            : "Connected"}
                </span>
              </div>
              <div className="account-body">
                <div>
                  <span className="label">Last successful sync</span>
                  <strong>{age(c.lastSuccessAt)}</strong>
                  {c.lastSuccessAt && (
                    <small>{syncDate(c.lastSuccessAt)}</small>
                  )}
                </div>
                {c.errorCode?.startsWith("RATE_LIMIT:") && (
                  <p>
                    {c.errorCode.split(":")[2]} of 16 asset categories
                    retrieved. Next retry after{" "}
                    {new Date(Number(c.errorCode.split(":")[1])).toLocaleString(
                      "en-IN",
                      { timeZone: "Asia/Kolkata" },
                    )}{" "}
                    IST.
                  </p>
                )}
                <p>
                  {c.errorCode
                    ? messages[c.errorCode.split(":")[0]] || messages.UNKNOWN
                    : c.id === "zerodha"
                      ? "Zerodha requires a fresh login each day. Previously synced investments remain available."
                      : "Read-only access through INDmoney. Refresh retrieves your selected investment scope; any provider limits and retry progress appear here."}
                </p>
              </div>
              <div className="account-actions">
                <ConnectAccount
                  id={c.id}
                  name={names[c.id]}
                  connected={c.connected}
                  ready={ready}
                  setup={d.setup}
                />
                {c.connected && (
                  <>
                    <ProviderAction
                      id={c.id}
                      action="refresh"
                      label="Refresh"
                    />
                    <details className="disconnect">
                      <summary>Disconnect</summary>
                      <p>
                        Remove access credentials immediately. Keep historical
                        values.
                      </p>
                      <ProviderAction
                        id={c.id}
                        action="disconnect"
                        label="Confirm disconnect"
                      />
                    </details>
                  </>
                )}
                {!ready && <small>One-time setup needed</small>}
              </div>
              {c.errorCode && (
                <details className="technical">
                  <summary>View technical details</summary>
                  <code>{c.errorCode}</code>
                </details>
              )}
            </section>
          );
        })}
      </div>
      <p className="footnote">
        Disconnecting removes local access credentials. Historical observations
        remain available and are labeled with their original sync time.
      </p>
    </>
  );
}
