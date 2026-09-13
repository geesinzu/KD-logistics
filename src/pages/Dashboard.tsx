import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { Package, Truck, Clock, CheckCircle, AlertTriangle, Plus, UserCheck, Boxes, Timer, Calendar, BarChart3 } from "lucide-react";

function getMonthYearOptions() {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    options.push({
      label: d.toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
      value: `${year}-${month}`,
    });
  }
  return options;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const role = user?.role;

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const monthOptions = getMonthYearOptions();

  const [year, month] = selectedMonth.split("-");

  const { data: stats } = trpc.shipment.stats.useQuery({ year: Number(year), month: Number(month) });
  const { data: attention } = trpc.shipment.attentionStats.useQuery();
  const { data: recentShipments } = trpc.shipment.list.useQuery({ page: 1, limit: 10, year: Number(year), month: Number(month) });
  const { data: userStats } = trpc.user.stats.useQuery(undefined, { enabled: isAdmin });

  const kpis = [
    { label: "Active Shipments", value: stats?.active ?? 0, icon: Package, color: "bg-blue-50 text-blue-700" },
    { label: "Pending Label", value: stats?.created ?? 0, icon: Clock, color: "bg-yellow-50 text-yellow-700" },
    { label: "In Transit", value: stats?.active ?? 0, icon: Truck, color: "bg-indigo-50 text-indigo-700" },
    { label: "Delivered", value: stats?.delivered ?? 0, icon: CheckCircle, color: "bg-green-50 text-green-700" },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-[#1E293B]">Dashboard</h1>
          <p className="text-xs text-gray-500">Welcome back, {user?.name?.split(" ")[0]}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}</Badge>
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-2 mb-4 bg-gray-50 rounded-lg p-2">
        <Calendar size={16} className="text-gray-400" />
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="flex-1 bg-transparent text-sm font-medium text-[#1E293B] outline-none cursor-pointer"
        >
          {monthOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Quick Actions */}
      {role && (["super_admin", "admin", "shipment_creator", "logistics_officer", "branch_manager"].includes(role)) && (
        <div className="flex gap-2 mb-4">
          {["super_admin", "admin", "shipment_creator", "logistics_officer"].includes(role) && (
            <Button size="sm" className="bg-[#003B7A] hover:bg-[#002B5A] flex-1 h-10" onClick={() => navigate("/shipments/create")}>
              <Plus size={16} className="mr-1" /> New Shipment
            </Button>
          )}
          {["super_admin", "admin", "branch_manager", "logistics_officer"].includes(role) && (
            <Button size="sm" variant="outline" className="h-10" onClick={() => navigate("/reports")}>
              <BarChart3 size={16} className="mr-1" /> Reports
            </Button>
          )}
        </div>
      )}

      {/* Attention Alert — Overdue/Due Soon */}
      {attention && attention.total > 0 && (
        <Card className={`border-0 shadow-sm mb-4 ${attention.overdue > 0 ? "bg-red-50" : "bg-amber-50"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {attention.overdue > 0 ? (
                <><AlertTriangle size={18} className="text-red-600" /><span className="text-sm font-semibold text-red-800">Attention Required</span></>
              ) : (
                <><Timer size={18} className="text-amber-600" /><span className="text-sm font-semibold text-amber-800">Deliveries Due Soon</span></>
              )}
            </div>
            <div className="flex gap-4 text-center">
              {attention.overdue > 0 && (
                <div><p className="text-2xl font-bold text-red-600">{attention.overdue}</p><p className="text-[10px] text-red-700">Overdue</p></div>
              )}
              {attention.dueSoon > 0 && (
                <div><p className="text-2xl font-bold text-amber-600">{attention.dueSoon}</p><p className="text-[10px] text-amber-700">Due within 24h</p></div>
              )}
              {attention.onTrack > 0 && (
                <div><p className="text-2xl font-bold text-green-600">{attention.onTrack}</p><p className="text-[10px] text-green-700">On track</p></div>
              )}
            </div>
            <Button size="sm" className={`mt-2 w-full ${attention.overdue > 0 ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
              onClick={() => navigate("/shipments")}>
              View Shipments
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon size={16} className={kpi.color.split(" ")[1]} />
                <span className="text-[10px] text-gray-500">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-[#1E293B]">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role-specific sections */}
      {role === "driver" && (
        <Card className="border-0 shadow-sm mb-4 bg-gradient-to-r from-[#003B7A] to-[#1E3A5F] text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">Today's Deliveries</p>
                <p className="text-3xl font-bold">{recentShipments?.shipments?.filter(s => s.assignedDriverId === user?.id).length ?? 0}</p>
              </div>
              <Truck size={32} className="opacity-50" />
            </div>
            <Button size="sm" variant="secondary" className="mt-3 w-full bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={() => navigate("/driver/deliveries")}>View My Deliveries</Button>
          </CardContent>
        </Card>
      )}

      {role === "warehouse_supply" && (
        <Card className="border-0 shadow-sm mb-4 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-yellow-600" />
              <span className="text-sm font-semibold text-yellow-800">Shipments Need Processing</span>
            </div>
            <p className="text-xs text-yellow-700 mb-2">{stats?.created ?? 0} shipments waiting for item count and label</p>
            <Button size="sm" className="w-full bg-yellow-600 hover:bg-yellow-700" onClick={() => navigate("/shipments")}>
              <Boxes size={14} className="mr-1" /> Process Shipments
            </Button>
          </CardContent>
        </Card>
      )}

      {role === "logistics_officer" && (
        <Card className="border-0 shadow-sm mb-4 bg-indigo-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={18} className="text-indigo-600" />
              <span className="text-sm font-semibold text-indigo-800">Ready for 3PL Assignment</span>
            </div>
            <p className="text-xs text-indigo-700 mb-2">{stats?.labeled ?? 0} labeled shipments need 3PL</p>
            <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate("/shipments")}>
              Assign to 3PL
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Admin stats */}
      {isAdmin && userStats && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">SYSTEM OVERVIEW</h3>
            <div className="flex justify-between text-center">
              <div><p className="text-lg font-bold">{userStats.total}</p><p className="text-[10px] text-gray-500">Users</p></div>
              <div><p className="text-lg font-bold text-yellow-600">{userStats.pending}</p><p className="text-[10px] text-gray-500">Pending</p></div>
              <div><p className="text-lg font-bold text-green-600">{userStats.active}</p><p className="text-[10px] text-gray-500">Active</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Shipments */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-[#1E293B]">Recent Shipments</h2>
        <button onClick={() => navigate("/shipments")} className="text-xs text-[#003B7A] hover:underline">See All</button>
      </div>
      <div className="space-y-2">
        {recentShipments?.shipments?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No shipments yet</p>}
        {recentShipments?.shipments?.map(s => (
          <Card key={s.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/shipments/${s.id}`)}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1E293B]">{s.trackingId || `#${s.id}`}</span>
                  <Badge className={`text-[9px] ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.destinationBranch} {s.receiverName ? `- ${s.receiverName}` : ""}</p>
              </div>
              <Package size={16} className="text-gray-300" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
