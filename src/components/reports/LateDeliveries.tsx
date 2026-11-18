import { Link } from "react-router";
import type { deliveredLateRows } from "@contracts/report-print";
import type { BriefRow } from "@contracts/delivery-brief";
const day = (ms: number | null) =>
  ms === null
    ? "Not recorded"
    : new Date(ms).toLocaleDateString("en-NG", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
export function LateDeliveries({
  rows,
  printing,
  page,
  setPage,
  exportCsv,
}: {
  rows: ReturnType<typeof deliveredLateRows>;
  printing: boolean;
  page: number;
  setPage: (page: number) => void;
  exportCsv: (rows: BriefRow[]) => void;
}) {
  const late = rows;
  return (
    <>
      <div className="view-intro">
        <div>
          <h2>Shipments delivered after ETA</h2>
          <p>
            Shipments created in the selected date range, with a recorded
            delivery after their ETA.
          </p>
        </div>
        <button className="btn" onClick={() => exportCsv(late)}>
          Export late deliveries
        </button>
      </div>
      <p className="print-only late-delivery-print-count">
        {late.length} shipment{late.length === 1 ? "" : "s"} delivered after ETA
        · Largest delays first
      </p>
      <div className="late-delivery-summary">
        <strong>{late.length}</strong>
        <span>delivered late</span>
        <p>
          Days late are counted by calendar date in Nigeria, using the ETA
          currently recorded in the app. A late branch acknowledgement is not
          treated as a late delivery.
        </p>
      </div>
      <div className="panel table-scroll">
        <table className="wide-table late-delivery-table">
          <thead>
            <tr>
              <th>Shipment</th>
              <th>Destination branch</th>
              <th>3PL</th>
              <th>ETA</th>
              <th>Delivered</th>
              <th>Days late</th>
            </tr>
          </thead>
          <tbody>
            {(printing ? late : late.slice((page - 1) * 30, page * 30)).map(
              row => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/shipments/${row.id}`}>{row.trackingId}</Link>
                  </td>
                  <td>
                    {row.branch}
                    {row.hub && (
                      <small className="brief-cell-note">
                        Delivered to {row.hub} hub
                      </small>
                    )}
                  </td>
                  <td>{row.partner}</td>
                  <td>{day(row.serviceEta)}</td>
                  <td>{day(row.serviceAt)}</td>
                  <td>
                    <strong className="late-days">
                      {row.daysLate} day{row.daysLate === 1 ? "" : "s"}
                    </strong>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        {!late.length && (
          <p className="empty">
            No recorded deliveries after ETA in this selection. Missing delivery
            dates or ETAs are not counted as on-time deliveries.
          </p>
        )}
      </div>
      <p className="late-delivery-note">
        For hub routes, delivery means arrival at the hub, where the 3PL’s work
        ends. Final branch acknowledgement is separate. Records without a usable
        delivery date or ETA are excluded.
      </p>
      {late.length > 30 && (
        <nav className="brief-pagination" aria-label="Late-delivery pages">
          <button
            className="btn"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.ceil(late.length / 30)}
          </span>
          <button
            className="btn"
            disabled={page >= Math.ceil(late.length / 30)}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
