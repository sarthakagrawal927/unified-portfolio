import Link from "next/link";
import { view } from "../server/view";
import {
  PageTitle,
  Health,
  Freshness,
  Empty,
  money,
  ConnectionRow,
} from "../components/ui";
import { HistoryChart } from "../components/chart";
import { allocation } from "../core/portfolio";
export default async function Overview() {
  const d = await view();
  const p = d.current;
  const groups = allocation(p, "asset_class");
  return (
    <>
      <PageTitle
        title="Your investments, together."
        description="One clear view. Every account, with its own source and timestamp."
      >
        <Health portfolio={p} />
      </PageTitle>
      <Freshness portfolio={p} />
      {!p.holdings.length ? (
        <Empty />
      ) : (
        <>
          <section className="valuation">
            <div className="valuation-label">Observed portfolio value</div>
            <div className="currency-values">
              {p.totals.map((t) => (
                <div key={t.currency}>
                  <span className="currency-tag">{t.currency}</span>
                  <small>
                    {p.providers
                      .filter((source) =>
                        p.holdings.some(
                          (h) =>
                            h.currency === t.currency &&
                            h.source === source.provider,
                        ),
                      )
                      .map((source) => `${source.provider}: ${source.status}`)
                      .join(" · ")}
                  </small>
                  <div className="hero-number">
                    {t.cashEstimated ? "≈ " : ""}
                    {money(t.totalValue ?? t.marketValue, t.currency)}
                  </div>
                  <div className="value-detail">
                    <span>Unrealized P&L</span>
                    <strong>{money(t.unrealizedPnL, t.currency)}</strong>
                  </div>
                  <div className="value-detail">
                    <span>
                      Cash {t.cashEstimated ? "(USD estimate)" : "balance"}
                    </span>
                    <span>
                      {t.cash === null
                        ? "Unavailable"
                        : money(t.cash, t.currency)}
                    </span>
                  </div>
                  <div className="value-detail">
                    <span>Invested</span>
                    <span>{money(t.investedValue, t.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="footnote">
              Portfolio value includes reported cash where available; otherwise
              holdings only. Estimates are marked ≈. Cash coverage:{" "}
              {p.coverage.cash}. Open positions are excluded from holdings
              value.
            </p>
          </section>
          {p.totals.map((total) => (
            <HistoryChart
              key={total.currency}
              currency={total.currency}
              rows={d.history.flatMap((h) => {
                const t = h.totals.find((t) => t.currency === total.currency);
                return t ? [{ day: h.day, value: t.marketValue }] : [];
              })}
            />
          ))}
          <p className="footnote">
            Investment returns are unavailable until transaction and cash-flow
            history is complete. Deposits, withdrawals and changes in holdings
            affect the observed value.
          </p>
          <div className="two-column">
            <section className="panel">
              <div className="section-heading">
                <h2>Where you’re invested</h2>
                <Link href="/holdings">View holdings ↗</Link>
              </div>
              {groups.map((g, i) => (
                <div className="allocation-row" key={g.currency + g.label}>
                  <div>
                    <span className={`allocation-dot color-${i % 4}`} />
                    <strong>{g.label}</strong>
                    <small>{g.currency}</small>
                  </div>
                  <div className="allocation-bar">
                    <span
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(g.percentage)))}%`,
                      }}
                    />
                  </div>
                  <span>{g.percentage}%</span>
                </div>
              ))}
              <p className="footnote">
                Share of holdings within each currency.
              </p>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Your accounts</h2>
                <Link href="/accounts">Manage ↗</Link>
              </div>
              {d.connections.map((c) => (
                <ConnectionRow key={c.id} connection={c} />
              ))}
            </section>
          </div>
        </>
      )}
      {p.excluded.length > 0 && (
        <aside className="warning">
          {p.excluded.length} linked observations excluded to prevent
          double-counting. Underlying account identity needs verification.
        </aside>
      )}
    </>
  );
}
