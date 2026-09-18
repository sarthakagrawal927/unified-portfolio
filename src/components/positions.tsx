import type { Position } from "../core/model";
import { money, names, age } from "./ui";
export function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Open positions"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {[
              "Instrument",
              "Broker / observed",
              "Net quantity",
              "Average price",
              "Last price",
              "Reported unrealized P&L",
              "Reported realized P&L",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => (
            <tr key={p.accountId + p.instrumentId + i}>
              <td>
                <strong>{p.ticker}</strong>
                <small>{p.exchange}</small>
              </td>
              <td>
                {names[p.source]}
                <small>{age(p.asOf)}</small>
              </td>
              <td className="numeric">{p.quantity}</td>
              <td className="numeric">{money(p.averagePrice, p.currency)}</td>
              <td className="numeric">{money(p.marketPrice, p.currency)}</td>
              <td className="numeric">{money(p.unrealizedPnL, p.currency)}</td>
              <td className="numeric">{money(p.realizedPnL, p.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
