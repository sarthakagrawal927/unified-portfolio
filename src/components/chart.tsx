"use client";
import { useState } from "react";
import { money } from "./ui";
export function HistoryChart({
  rows,
  currency,
}: {
  rows: { day: string; value: string }[];
  currency: string;
}) {
  const [period, setPeriod] = useState("1M");
  const ranges: Record<string, number> = {
    "1D": 1,
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "1Y": 365,
    ALL: 365000,
  };
  const start = new Date(Date.now() - ranges[period] * 86400000)
    .toISOString()
    .slice(0, 10);
  const points = rows.filter((r) => r.day >= start);
  const values = points.map((p) => Number(p.value));
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = max - min || Math.max(max * 0.01, 1);
  const d = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${40 + ((Date.parse(points[i].day) - Date.parse(points[0].day)) / Math.max(Date.parse(points.at(-1)!.day) - Date.parse(points[0].day), 1)) * 720},${190 - ((v - min) / span) * 140}`,
    )
    .join(" ");
  return (
    <section className="chart-section">
      <div className="section-heading">
        <div>
          <h2>Portfolio value</h2>
          <p>Daily observations · {currency}</p>
        </div>
        <div className="periods" role="group" aria-label="History period">
          {Object.keys(ranges).map((p) => (
            <button
              key={p}
              aria-pressed={p === period}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {points.length < 2 ? (
        <div className="chart-empty">
          <p>History builds with each daily snapshot.</p>
          <small>At least two observations are needed for this period.</small>
        </div>
      ) : (
        <>
          <svg
            className="chart"
            viewBox="0 0 800 240"
            role="img"
            aria-label={`Portfolio value from ${points[0].day} to ${points.at(-1)!.day}. ${money(points[0].value, currency)} to ${money(points.at(-1)!.value, currency)}.`}
          >
            <line x1="40" x2="760" y1="190" y2="190" stroke="#dbe2da" />
            <line x1="40" x2="760" y1="50" y2="50" stroke="#e8ece6" />
            <path
              d={d}
              fill="none"
              stroke="#235d45"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </svg>
          <div className="chart-range chart-dates">
            <span>{points[0].day}</span>
            <span>{points.at(-1)!.day}</span>
          </div>
          <div className="chart-range">
            <span>From {money(points[0].value, currency)}</span>
            <span>Latest {money(points.at(-1)!.value, currency)}</span>
          </div>
          <details>
            <summary>View daily values</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.day}>
                      <td>{p.day}</td>
                      <td>{money(p.value, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="footnote">
        Value change includes changes in holdings and contributions. It is not
        investment return.
      </p>
    </section>
  );
}
