import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { ArrowLeft, Package, Calendar, Truck, CheckCircle2 } from "lucide-react";

export default function DriverDeliveries() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  const { data: deliveries, isLoading } = trpc.shipment.myDeliveries.useQuery({ page: 1, limit: 50 });

  const filtered = deliveries?.filter(d => {
    if (filter === "active") return !["delivered", "completed", "cancelled"].includes(d.status);
    if (filter === "completed") return ["delivered", "completed"].includes(d.status);
    return true;
  }) || [];

  const todayCount = filtered.filter(d => d.updatedAt && new Date(d.updatedAt).toDateString() === new Date().toDateString()).length;
  const totalCount = filtered.length;
  const completedCount = filtered.filter(d => ["delivered", "completed"].includes(d.status)).length;

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">My Deliveries</h1>
      </div>
      <div className="p-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><Truck size={18} className="mx-auto mb-1 text-blue-600" /><p className="text-xl font-bold">{totalCount}</p><p className="text-[10px] text-gray-500">Total</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><Calendar size={18} className="mx-auto mb-1 text-yellow-600" /><p className="text-xl font-bold">{todayCount}</p><p className="text-[10px] text-gray-500">Today</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><CheckCircle2 size={18} className="mx-auto mb-1 text-green-600" /><p className="text-xl font-bold">{completedCount}</p><p className="text-[10px] text-gray-500">Completed</p></CardContent></Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-3">
          {["all", "active", "completed"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${filter === f ? "bg-[#003B7A] text-white" : "bg-gray-100 text-gray-600"}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Deliveries list */}
        {isLoading && <p className="text-center py-4 text-gray-400">Loading...</p>}
        {filtered.length === 0 && <p className="text-center py-8 text-gray-400">No deliveries found</p>}
        <div className="space-y-2">
          {filtered.map(d => (
            <Card key={d.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/shipments/${d.id}`)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[#003B7A]">{d.trackingId || `#${d.id}`}</span>
                      <Badge className={`text-[9px] ${STATUS_COLORS[d.status] || ""}`}>{STATUS_LABELS[d.status] || d.status}</Badge>
                    </div>
                    <p className="text-[11px] text-gray-500">{d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : ""}</p>
                  </div>
                  <Package size={16} className="text-gray-300" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
