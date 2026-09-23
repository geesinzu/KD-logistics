import { useState } from "react";
import { useNavigate } from "react-router";
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
  const isViewer = role === "viewer";

  // Status group mapping: tab label → comma-separated DB statuses
  const STATUS_GROUPS: Record<string, string> = {
    "": "",
    "created": "created",
    "labeled": "labeled",
    "assigned_to_3pl": "waiting_driver_pickup,waiting_3pl_pickup,at_3pl",
    "picked_up": "picked_up,picked_up_by_3pl",
    "in_transit_with_3pl": "tpl_confirmed,in_transit_with_3pl,partially_delivered",
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
    "delivered": "Delivered",
    "completed": "Completed",
    "cancelled": "Cancelled",
  };
  const tabKeys = Object.keys(STATUS_GROUPS);

  // Must be AFTER STATUS_GROUPS definition
  const apiStatus = status ? STATUS_GROUPS[status] : undefined;
  const { data, isLoading } = trpc.shipment.list.useQuery({ page: 1, limit: 50, status: apiStatus, search: search || undefined });

  // Fetch ALL shipments for tab counts (only when no search filter)
  const { data: allData } = trpc.shipment.list.useQuery(
    { page: 1, limit: 200, search: undefined },
    { enabled: !search } // Only fetch when not searching
  );

  // Compute counts per tab from all shipments
  const tabCounts: Record<string, number> = {};
  const allShipments = allData?.shipments || [];
  for (const key of tabKeys) {
    if (key === "") {
      tabCounts[key] = allShipments.length;
    } else {
      const statuses = STATUS_GROUPS[key].split(",").filter(Boolean);
      tabCounts[key] = allShipments.filter((s: any) => statuses.includes(s.status)).length;
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto bg-ground min-h-full">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold font-display text-ink">Shipments</h1>
        {canCreate && (
          <Button size="sm" className="bg-navy hover:bg-[#0F2039] h-9 rounded-xl font-semibold" onClick={() => navigate("/shipments/create")}>
            <Plus size={14} className="mr-1" /> New
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
        <Input className="pl-9 h-11 rounded-2xl border-[#E8E4DC] bg-white" placeholder="Search by tracking ID..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Status filter tabs with counts */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {tabKeys.map(key => (
          <button key={key} onClick={() => setStatus(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap font-semibold transition-colors inline-flex items-center gap-1 ${status === key ? "bg-navy text-white" : "bg-white border border-[#E8E4DC] text-ink-soft hover:bg-navy-soft"}`}>
            {TAB_LABELS[key] || "All"}
            <span className={`text-[9px] px-1 py-0.5 rounded-full ${status === key ? "bg-white/20 text-white" : "bg-[#EEF1F4] text-ink-soft"}`}>
              {tabCounts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Shipments list */}
      {isLoading && <div className="text-center py-8 text-ink-soft">Loading...</div>}
      <div className="space-y-2">
        {data?.shipments?.length === 0 && <div className="text-center py-8 text-ink-soft">No shipments found</div>}
        {data?.shipments?.map(s => (
          <Card key={s.id} className="border border-[#E8E4DC] shadow-none rounded-2xl cursor-pointer hover:border-navy/30 transition-colors" onClick={() => navigate(`/shipments/${s.id}`)}>
            <CardContent className="p-3.5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold font-display text-ink">{s.trackingId || `#${s.id}`}</span>
                    <Badge className={`text-[9px] rounded-full ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                  </div>
                  <p className="text-[11px] text-ink-soft">To: {s.destinationBranch}</p>
                  <p className="text-[11px] text-ink-soft">{s.actualItemCount || s.estimatedItemCount || 0} items {s.receiverName ? `- ${s.receiverName}` : ""}</p>
                  {s.slaStatus && s.slaStatus !== "no_eta" && (
                    <div className={`flex items-center gap-1 text-[10px] mt-0.5 font-semibold ${
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
                    <p className="text-[10px] text-ink-soft/70">
                      ETA: {new Date(s.estimatedDeliveryDate).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  )}
                  {s.deliveryOutcome === "on_time" && (
                    <div className="flex items-center gap-1 text-[10px] mt-0.5 font-semibold text-[#1E7B4D]">
                      <CheckCircle2 size={10} /> On time
                    </div>
                  )}
                  {s.deliveryOutcome === "late" && (
                    <div className="flex items-center gap-1 text-[10px] mt-0.5 font-semibold text-[#B3261E]">
                      <AlertTriangle size={10} /> Overdue by {s.daysLate} day{s.daysLate === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.status === "created" && canWarehouse && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 rounded-lg border-[#E8E4DC]"
                      onClick={e => { e.stopPropagation(); navigate(`/warehouse/${s.id}`); }}>
                      <QrCode size={12} className="mr-1" /> Label
                    </Button>
                  )}
                  {s.status === "labeled" && canLogistics && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 rounded-lg border-[#E8E4DC]"
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
    </div>
  );
}
