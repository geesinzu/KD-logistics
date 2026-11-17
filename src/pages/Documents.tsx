import { useState } from "react";
import { Link } from "react-router";
import { FolderLock, Search, ArrowUpRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { DOCUMENT_KINDS, DOCUMENT_LABELS } from "@contracts/operations";
import { OperationsGate } from "@/components/operations/OperationsGate";
import { DocumentList } from "@/components/operations/DocumentList";
import { Button } from "@/components/ui/button";
function Library() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<(typeof DOCUMENT_KINDS)[number] | "">("");
  const [page, setPage] = useState(1);
  const query = trpc.operations.library.useQuery({
    search: search || undefined,
    kind: kind || undefined,
    page,
  });
  return (
    <>
      <div className="ops-toolbar">
        <label className="ops-search">
          <Search size={18} />
          <input
            aria-label="Search documents"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search filename or tracking ID"
          />
        </label>
        <select
          aria-label="Document type filter"
          className="ops-select"
          value={kind}
          onChange={e => {
            setKind(e.target.value as typeof kind);
            setPage(1);
          }}
        >
          <option value="">All document types</option>
          {DOCUMENT_KINDS.map(k => (
            <option key={k} value={k}>
              {DOCUMENT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <section className="ops-panel">
        <div className="ops-section-heading">
          <h2>Shipment paperwork</h2>
          <span className="ops-muted">
            {query.data?.total ?? 0} document
            {query.data?.total === 1 ? "" : "s"}
          </span>
        </div>
        {query.isLoading ? (
          <p role="status">Loading documents…</p>
        ) : query.error ? (
          <div className="ops-empty" role="alert">
            <p>Could not load the document library.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : query.data?.items.length ? (
          <DocumentList files={query.data.items} />
        ) : (
          <div className="ops-empty">
            <FolderLock size={36} />
            <h2>
              {search || kind
                ? "No matching documents"
                : "Your paperwork, in one place"}
            </h2>
            <p>
              {search || kind
                ? "Try a different search or document type."
                : "Open a shipment and choose Attach document to add its waybill, invoice or delivery note."}
            </p>
            <Link to="/shipments" className="ops-text-link">
              Open shipments <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
      </section>
      {query.data && query.data.total > 20 && (
        <nav className="ops-pagination" aria-label="Document pages">
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
export default function Documents() {
  return (
    <div className="ops-workspace">
      <header className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">KEDI RECORDS</span>
          <h1>Document library</h1>
          <p>The right paperwork, attached to the right shipment.</p>
        </div>
        <span className="ops-private-badge">
          <FolderLock size={15} /> KEDI staff only
        </span>
      </header>
      <OperationsGate>
        <Library />
      </OperationsGate>
    </div>
  );
}
