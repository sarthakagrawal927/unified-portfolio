import { PositionsTable } from "../../components/positions";
import { view } from "../../server/view";
import { PageTitle, Freshness, Empty, Health } from "../../components/ui";
import { HoldingsTable } from "../../components/holdings";
export default async function Holdings() {
  const d = await view();
  return (
    <>
      <PageTitle
        title="Holdings"
        description="Every investment, with the detail behind the total."
      >
        <Health portfolio={d.current} />
      </PageTitle>
      <Freshness portfolio={d.current} />
      {d.current.holdings.length ? (
        <HoldingsTable holdings={d.current.holdings} />
      ) : (
        <Empty title="Your holdings will appear here" />
      )}
      {d.snapshots.some((s) => s.positions.length > 0) && (
        <section className="panel">
          <h2>Open positions</h2>
          <p>
            Shown separately from holdings. Derivative notional value is not net
            portfolio value.
          </p>
          <PositionsTable positions={d.snapshots.flatMap((s) => s.positions)} />
        </section>
      )}
    </>
  );
}
