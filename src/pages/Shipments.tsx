import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { Plus, Search, QrCode, Truck, Clock, AlertTriangle } from "lucide-react";

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

  const apiStatus = status ? STATUS_GROUPS[status] : undefined;
  const { data, isLoading } = trpc.shipment.list.useQuery({ page: 1, limit: 50, status: apiStatus, search: search || undefined });

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

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold text-[#1E293B]">Shipments</h1>
        {canCreate && (
          <Button size="sm" className="bg-[#003B7A] hover:bg-[#002B5A] h-9" onClick={() => navigate("/shipments/create")}>
            <Plus size={14} className="mr-1" /> New
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9 h-10" placeholder="Search by tracking ID..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {tabKeys.map(key => (
          <button key={key} onClick={() => setStatus(key)}
            className={`px-3 py-1 rounded-full text-[10px] whitespace-nowrap font-medium transition-colors ${status === key ? "bg-[#003B7A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {TAB_LABELS[key] || "All"}
          </button>
        ))}
      </div>

      {/* Shipments list */}
      {isLoading && <div className="text-center py-8 text-gray-400">Loading...</div>}
      <div className="space-y-2">
        {data?.shipments?.length === 0 && <div className="text-center py-8 text-gray-400">No shipments found</div>}
        {data?.shipments?.map(s => (
          <Card key={s.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/shipments/${s.id}`)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#003B7A]">{s.trackingId || `#${s.id}`}</span>
                    <Badge className={`text-[9px] ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">To: {s.destinationBranch}</p>
                  <p className="text-[11px] text-gray-500">{s.actualItemCount || s.estimatedItemCount || 0} items {s.receiverName ? `- ${s.receiverName}` : ""}</p>
                  {s.slaStatus && s.slaStatus !== "no_eta" && (
                    <div className={`flex items-center gap-1 text-[10px] mt-0.5 font-medium ${
                      s.slaStatus === "overdue" ? "text-red-600" :
                      s.slaStatus === "due_soon" ? "text-amber-600" :
                      "text-green-600"
                    }`}>
                      {s.slaStatus === "overdue" && <AlertTriangle size={10} />}
                      {s.slaStatus === "due_soon" && <Clock size={10} />}
                      {s.slaStatus === "overdue" ? `Overdue by ${Math.abs(s.daysUntilEta ?? 0)} day(s)` :
                       s.slaStatus === "due_soon" ? `Due within 24h` :
                       `${s.daysUntilEta} day(s) until delivery`}
                    </div>
                  )}
                  {s.estimatedDeliveryDate && (
                    <p className="text-[10px] text-gray-400">
                      ETA: {new Date(s.estimatedDeliveryDate).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.status === "created" && canWarehouse && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2"
                      onClick={e => { e.stopPropagation(); navigate(`/warehouse/${s.id}`); }}>
                      <QrCode size={12} className="mr-1" /> Label
                    </Button>
                  )}
                  {s.status === "labeled" && canLogistics && (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-2"
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
