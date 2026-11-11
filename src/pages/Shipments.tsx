import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { Plus, Search, QrCode, Truck, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function Shipments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const canCreate = role && ["super_admin", "admin", "shipment_creator", "logistics_officer"].includes(role);
  const canWarehouse = role && ["super_admin", "admin", "warehouse_supply"].includes(role);
  const canLogistics = role && ["super_admin", "admin", "logistics_officer"].includes(role);
  const [page, setPage] = useState(1);

  // Status group mapping: tab label → comma-separated DB statuses
  const STATUS_GROUPS: Record<string, string> = {
    "": "",
    "created": "created",
    "labeled": "labeled",
    "assigned_to_3pl": "waiting_driver_pickup,waiting_3pl_pickup,at_3pl",
    "picked_up": "picked_up,picked_up_by_3pl",
    "in_transit_with_3pl": "tpl_confirmed,in_transit_with_3pl,partially_delivered",
    "at_hub_onward": "at_hub,onward_in_transit",
    "delivered": "delivered",
    "completed": "completed",
    "cancelled": "cancelled",
  };
  const TAB_LABELS: Record<string, string> = {
    "": "All",
    "created": "Created",
    "labeled": "Labeled",
    "assigned_to_3pl": "Assigned to 3PL",
    "picked_up": "Picked Up",
    "in_transit_with_3pl": "In Transit",
    "at_hub_onward": "At Hub / Onward",
    "delivered": "Delivered",
    "completed": "Completed",
    "cancelled": "Cancelled",
  };
  const tabKeys = Object.keys(STATUS_GROUPS);

  // Must be AFTER STATUS_GROUPS definition
  const apiStatus = status ? STATUS_GROUPS[status] : undefined;
  const { data, isLoading, error, refetch } = trpc.shipment.list.useQuery({ page, limit: 50, status: apiStatus, search: search || undefined });
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div className="shipment-workspace">
      <div className="operations-heading">
        <div><p className="operations-eyebrow">EVERY SHIPMENT, IN SIGHT</p><h1>Shipments</h1><p>Follow each handoff, from the warehouse to its destination.</p></div>
        {canCreate && (
          <Button size="sm" className="bg-navy hover:bg-[#0F2039] h-11 rounded-lg font-semibold" onClick={() => navigate("/shipments/create")}>
            <Plus size={14} className="mr-1" /> New shipment
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="shipment-search">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
        <label className="sr-only" htmlFor="shipment-search">Search shipments</label>
        <Input id="shipment-search" className="pl-9 h-11 rounded-2xl border-[#E8E4DC] bg-white" placeholder="Search by tracking ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Status filters */}
      <div className="shipment-filters" aria-label="Filter shipments by status">
        {tabKeys.map(key => (
          <button key={key} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-semibold transition-colors inline-flex items-center gap-1 ${status === key ? "bg-navy text-white" : "bg-white border border-[#E8E4DC] text-ink-soft hover:bg-navy-soft"}`}>
            {TAB_LABELS[key] || "All"}

          </button>
        ))}
      </div>

      {/* Shipments list */}
      {isLoading && <div role="status" className="operations-message">Loading shipments…</div>}
      {error && <div role="alert" className="operations-message">Could not load shipments. <button className="underline" onClick={() => void refetch()}>Try again</button></div>}
      {data && <p className="shipment-result-count">{data.total} matching shipment{data.total === 1 ? "" : "s"}</p>}
      <div className="shipment-list-grid">
        {data?.shipments?.length === 0 && <div className="text-center py-8 text-ink-soft">No shipments found</div>}
        {data?.shipments?.map(s => (
          <Card key={s.id} className="shipment-card">
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Link className="shipment-tracking-link" to={`/shipments/${s.id}`}>{s.trackingId || `#${s.id}`}</Link>
                    <Badge className={`text-xs rounded-md ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                  </div>
                  <p className="text-xs text-ink-soft">To: {s.destinationBranch}{s.hubBranchName ? ` (via ${s.hubBranchName} hub)` : ""}</p>
                  <p className="text-xs text-ink-soft">{s.actualItemCount || s.estimatedItemCount || 0} items {s.receiverName ? `- ${s.receiverName}` : ""}</p>
                  {s.slaStatus && s.slaStatus !== "no_eta" && (
                    <div className={`flex items-center gap-1 text-xs mt-0.5 font-semibold ${
                      s.slaStatus === "overdue" ? "text-[#B3261E]" :
                      s.slaStatus === "due_soon" ? "text-[#B7791F]" :
                      "text-[#1E7B4D]"
                    }`}>
                      {s.slaStatus === "overdue" && <AlertTriangle size={10} />}
                      {s.slaStatus === "due_soon" && <Clock size={10} />}
                      {s.slaStatus === "overdue" ? `Overdue by ${Math.abs(s.daysUntilEta ?? 0)} day(s)` :
                       s.slaStatus === "due_soon" ? `Due within 24h` :
                       `${s.daysUntilEta} day(s) until delivery`}
                    </div>
                  )}
                  {s.estimatedDeliveryDate && (
                    <p className="text-xs text-ink-soft/70">
                      ETA: {new Date(s.estimatedDeliveryDate).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  )}
                  {s.deliveryOutcome === "on_time" && (
                    <div className="flex items-center gap-1 text-xs mt-0.5 font-semibold text-[#1E7B4D]">
                      <CheckCircle2 size={10} /> On time
                    </div>
                  )}
                  {s.deliveryOutcome === "late" && (
                    <div className="flex items-center gap-1 text-xs mt-0.5 font-semibold text-[#B3261E]">
                      <AlertTriangle size={10} /> Overdue by {s.daysLate} day{s.daysLate === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0 ml-3">
                  <Link className="shipment-details-link" to={`/shipments/${s.id}`}>View details →</Link>
                  {s.status === "created" && canWarehouse && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 rounded-lg border-[#E8E4DC]"
                      onClick={e => { e.stopPropagation(); navigate(`/warehouse/${s.id}`); }}>
                      <QrCode size={12} className="mr-1" /> Label
                    </Button>
                  )}
                  {s.status === "labeled" && canLogistics && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 rounded-lg border-[#E8E4DC]"
                      onClick={e => { e.stopPropagation(); navigate(`/assign-3pl/${s.id}`); }}>
                      <Truck size={12} className="mr-1" /> Assign
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {data && pageCount > 1 && <nav className="shipment-pagination" aria-label="Shipment pages"><Button variant="outline" disabled={page === 1 || isLoading} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page} of {pageCount}</span><Button variant="outline" disabled={page >= pageCount || isLoading} onClick={() => setPage(p => p + 1)}>Next</Button></nav>}
    </div>
  );
}
