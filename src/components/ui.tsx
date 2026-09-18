import Link from "next/link";
import type { Portfolio } from "../core/portfolio";
import type { Connection } from "../core/model";
export const names: Record<string, string> = {
  zerodha: "Zerodha",
  angelone: "Angel One",
  indmoney: "INDmoney",
};
export function money(value: string | null, currency = "INR") {
  return value === null
    ? "Unknown"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(Number(value));
}
export function age(value: string | null) {
  if (!value) return "Not synced yet";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60000),
  );
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes} min ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hr ago`
        : `${Math.floor(minutes / 1440)} day ago`;
}
export function syncDate(value: string | null) {
  if (!value) return "Not synced yet";
  return (
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(value)) + " IST"
  );
}
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Health({ portfolio: p }: { portfolio: Portfolio }) {
  const current = p.providers.filter((p) => p.status === "current").length;
  return (
    <Link
      className={`health ${current < p.providers.length ? "attention" : ""}`}
      href="/accounts"
    >
      <span className="dot" />
      {current}/{p.providers.length} accounts current{" "}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
export function Freshness({ portfolio: p }: { portfolio: Portfolio }) {
  const stale = p.providers.filter((provider) => provider.status === "stale");
  return (
    <>
      {p.observationNotes.map((note) => (
        <aside className="warning" key={note}>
          {note}
        </aside>
      ))}
      {stale.length ? (
        <aside className="warning">
          <strong>Showing the latest successfully stored data.</strong>
          <ul className="freshness-list">
            {stale.map((provider) => (
              <li key={provider.provider}>
                {names[provider.provider] || provider.provider}: last synced{" "}
                <time dateTime={provider.lastSync || undefined}>
                  {syncDate(provider.lastSync)}
                </time>
              </li>
            ))}
          </ul>
          These values are retained but are not current market data.{" "}
          <Link href="/accounts">Review connections →</Link>
        </aside>
      ) : null}
    </>
  );
}
export function Empty({
  title = "Your portfolio starts here",
  text = "Connect an investment account to see your holdings, allocation and history.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        ◎
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" href="/accounts">
        Connect investments <span aria-hidden="true">↗</span>
      </Link>
    </div>
  );
}
export function ProviderAction({
  id,
  action,
  label,
  disabled = false,
}: {
  id: string;
  action: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <form action={`/api/providers/${id}/${action}`} method="post">
      <button
        disabled={disabled}
        className={action === "disconnect" ? "text-button" : "button secondary"}
      >
        {label}
      </button>
    </form>
  );
}
export function ConnectionRow({ connection: c }: { connection: Connection }) {
  return (
    <div className="source-row">
      <span className={`broker-logo ${c.id}`}>{names[c.id].slice(0, 1)}</span>
      <div>
        <strong>{names[c.id]}</strong>
        <small>{c.ownerLabel || "Unlabeled"}</small>
        <small>Last synced {syncDate(c.lastSuccessAt)}</small>
      </div>
      <span className={`status ${c.status === "NEEDS_LOGIN" ? "warn" : ""}`}>
        {c.status === "NEEDS_LOGIN"
          ? c.connected
            ? "Login required"
            : "Not connected"
          : c.status === "SYNCING"
            ? "Refreshing"
            : c.status === "ERROR"
              ? "Needs attention"
              : "Connected"}
      </span>
    </div>
  );
}
