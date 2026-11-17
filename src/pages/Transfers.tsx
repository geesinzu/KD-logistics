import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  Plus,
  Search,
  PackageCheck,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { TRANSFER_STATUSES, TRANSFER_LABELS } from "@contracts/operations";
import { OperationsGate } from "@/components/operations/OperationsGate";
import { Button } from "@/components/ui/button";
import { operationDate } from "@/lib/operationFiles";
function TransferList() {
  const [status, setStatus] = useState<(typeof TRANSFER_STATUSES)[number] | "">(
    ""
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { role } = useAuth();
  const query = trpc.operations.transfers.useQuery({
    status: status || undefined,
    search: search || undefined,
    page,
  });
  const canRequest = role !== "viewer";
  return (
    <>
      <div className="ops-toolbar">
        <label className="ops-search">
          <Search size={18} />
          <input
            aria-label="Search transfers"
            placeholder="Search reference, items or company"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          className="ops-select"
          aria-label="Transfer status filter"
          value={status}
          onChange={e => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="">All transfer stages</option>
          {TRANSFER_STATUSES.map(s => (
            <option key={s} value={s}>
              {TRANSFER_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="ops-list-heading">
        <h2>
          Branch handovers <span>{query.data?.total ?? 0}</span>
        </h2>
        <p>Separate from your normal shipment workflow</p>
      </div>
      {query.isLoading ? (
        <div className="ops-empty" role="status">
          Loading branch transfers…
        </div>
      ) : query.error ? (
        <div className="ops-empty" role="alert">
          <p>Could not load transfers.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : !query.data?.items.length ? (
        <div className="ops-empty ops-panel">
          <ArrowLeftRight size={38} />
          <h2>
            {search || status
              ? "No matching transfers"
              : "A clear handover between branches"}
          </h2>
          <p>
            {search || status
              ? "Choose another stage or search term."
              : "Request a transfer, get approval, and confirm each item at the receiving branch."}
          </p>
          {canRequest && (
            <Button asChild className="bg-navy">
              <Link to="/transfers/new">
                <Plus size={16} /> Request a transfer
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="ops-transfer-grid">
          {query.data.items.map(t => (
            <Link
              key={t.id}
              to={`/transfers/${t.id}`}
              className="ops-transfer-card"
            >
              <div className="ops-transfer-card-top">
                <strong>{t.reference}</strong>
                <span className={`ops-status ops-status-${t.status}`}>
                  {TRANSFER_LABELS[t.status]}
                </span>
              </div>
              <div className="ops-route">
                <span>{t.sourceName}</span>
                <ArrowRight size={19} />
                <span>{t.destinationName}</span>
              </div>
              <h3>{t.description}</h3>
              <div className="ops-card-progress">
                <span>
                  <strong>{t.quantity}</strong> {t.unit}
                </span>
                <span>
                  {t.receivedQty} received · {t.quantity - t.receivedQty}{" "}
                  outstanding
                </span>
              </div>
              <div className="ops-progress-track">
                <span
                  style={{ width: `${(t.receivedQty / t.quantity) * 100}%` }}
                />
              </div>
              <footer>
                <span>{operationDate(t.createdAt)}</span>
                <span>
                  View transfer <ArrowRight size={13} />
                </span>
              </footer>
            </Link>
          ))}
        </div>
      )}
      {query.data && query.data.total > 20 && (
        <nav className="ops-pagination" aria-label="Transfer pages">
          <Button
            variant="outline"
            disabled={page === 1 || query.isFetching}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <span>
            {page} / {Math.ceil(query.data.total / 20)}
          </span>
          <Button
            variant="outline"
            disabled={
              page >= Math.ceil(query.data.total / 20) || query.isFetching
            }
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
export default function Transfers() {
  const { role } = useAuth();
  return (
    <div className="ops-workspace">
      <header className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">BRANCH OPERATIONS</span>
          <h1>Branch transfers</h1>
          <p>One request. Clear approval. A confirmed handover.</p>
        </div>
        {role !== "viewer" && (
          <Button asChild className="bg-navy">
            <Link to="/transfers/new">
              <Plus size={17} /> Request transfer
            </Link>
          </Button>
        )}
      </header>
      <div className="ops-intro-strip">
        <PackageCheck size={21} />
        <p>
          <strong>Handled by KEDI branches.</strong> Record the transport
          arrangements here. The transport company does not need an app account.
        </p>
      </div>
      <OperationsGate>
        <TransferList />
      </OperationsGate>
    </div>
  );
}
