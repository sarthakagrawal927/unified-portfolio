"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import type { Holding } from "../core/model";
import { money, names, syncDate } from "./ui";
export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [broker, setBroker] = useState("");
  const [asset, setAsset] = useState("");
  const [country, setCountry] = useState("");
  const [exchange, setExchange] = useState("");
  const [gain, setGain] = useState("");
  const [sort, setSort] = useState("name");
  const rows = holdings
    .filter(
      (h) =>
        (h.name + " " + h.ticker + " " + h.isin)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!owner || (h.ownerLabel || "Unlabeled") === owner) &&
        (!broker || h.custodyBroker === broker) &&
        (!asset || h.assetClass === asset) &&
        (!country || h.country === country) &&
        (!exchange || h.exchange === exchange) &&
        (!gain ||
          (h.investedValue !== null &&
            (gain === "gain"
              ? new Decimal(h.marketValue).gte(h.investedValue)
              : new Decimal(h.marketValue).lt(h.investedValue)))),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : a.currency.localeCompare(b.currency) ||
          new Decimal(b.marketValue).cmp(a.marketValue),
    );
  const options = (key: keyof Holding) =>
    [...new Set(holdings.map((h) => String(h[key])))].sort();
  const total = (currency: string) =>
    holdings
      .filter((h) => h.currency === currency)
      .reduce((s, h) => s.plus(h.marketValue), new Decimal(0));
  return (
    <>
      <div className="filters">
        <label className="search">
          Search holdings
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Company, ticker or ISIN"
          />
        </label>
        {(
          [
            ["Owner", owner, setOwner, options("ownerLabel")],
            ["Broker", broker, setBroker, options("custodyBroker")],
            ["Asset class", asset, setAsset, options("assetClass")],
            ["Country", country, setCountry, options("country")],
            ["Exchange", exchange, setExchange, options("exchange")],
            ["Gain / loss", gain, setGain, ["gain", "loss"]],
          ] as const
        ).map(([label, value, set, values]) => (
          <label key={label}>
            {label}
            <select value={value} onChange={(e) => set(e.target.value)}>
              <option value="">All</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {names[v] || v}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Company name</option>
            <option value="value">Value by currency</option>
          </select>
        </label>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Holdings table"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              {[
                "Instrument",
                "Owner",
                "Broker / observed",
                "Quantity",
                "Avg price",
                "Last price",
                "Invested",
                "Value",
                "Unrealized P&L",
                "P&L %",
                "Allocation",
              ].map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => {
              const pnl =
                h.investedValue === null
                  ? null
                  : new Decimal(h.marketValue).minus(h.investedValue);
              return (
                <tr key={h.accountId + h.instrumentId + i}>
                  <td>
                    <strong>{h.name}</strong>
                    <small>
                      {h.ticker} · {h.exchange} · {h.currency}
                    </small>
                  </td>
                  <td>{h.ownerLabel || "Unlabeled"}</td>
                  <td>
                    {names[h.custodyBroker] || h.custodyBroker}
                    <small>As of {syncDate(h.asOf)}</small>
                  </td>
                  <td className="numeric">{h.quantity ?? "Unknown"}</td>
                  <td className="numeric">
                    {money(h.averagePrice, h.currency)}
                  </td>
                  <td className="numeric">
                    {money(h.marketPrice, h.currency)}
                  </td>
                  <td className="numeric">
                    {money(h.investedValue, h.currency)}
                  </td>
                  <td className="numeric strong">
                    {money(h.marketValue, h.currency)}
                  </td>
                  <td
                    className={`numeric ${pnl?.isNegative() ? "negative" : "positive"}`}
                  >
                    {money(pnl?.toFixed() ?? null, h.currency)}
                  </td>
                  <td className="numeric">
                    {pnl &&
                    h.investedValue &&
                    !new Decimal(h.investedValue).isZero()
                      ? pnl.div(h.investedValue).times(100).toFixed(2) + "%"
                      : "Unknown"}
                  </td>
                  <td className="numeric">
                    {total(h.currency).isZero()
                      ? "—"
                      : new Decimal(h.marketValue)
                          .div(total(h.currency))
                          .times(100)
                          .toFixed(1) + "%"}
                    <small>of {h.currency} holdings</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="no-results">No holdings match these filters.</p>
        )}
      </div>
      <p className="footnote">
        {rows.length} holdings · Cost basis and returns remain unknown when the
        provider does not supply them.
      </p>
    </>
  );
}
