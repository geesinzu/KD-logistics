import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { Package, Truck, Clock, CheckCircle, AlertTriangle, Plus, UserCheck, Boxes, Timer, Calendar, BarChart3, ChevronDown } from "lucide-react";

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
    { label: "Active Shipments", value: stats?.active ?? 0, icon: Package, iconColor: "text-ink-soft", chip: "bg-[#EEF1F4]" },
    { label: "Pending Label", value: stats?.created ?? 0, icon: Clock, iconColor: "text-[#B7791F]", chip: "bg-clay-soft" },
    { label: "In Transit", value: stats?.inTransit ?? 0, icon: Truck, iconColor: "text-navy", chip: "bg-navy-soft" },
    { label: "Delivered", value: stats?.delivered ?? 0, icon: CheckCircle, iconColor: "text-[#1E7B4D]", chip: "bg-[#E7F3EC]" },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto bg-ground min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold font-display text-ink">Dashboard</h1>
          <p className="text-xs text-ink-soft">Welcome back, {user?.name?.split(" ")[0]}</p>
        </div>
        <Badge variant="outline" className="text-[10px] font-semibold text-navy bg-navy-soft border-transparent rounded-full">{ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role}</Badge>
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-2 mb-4 bg-white border border-[#E8E4DC] rounded-2xl px-4 py-3">
        <Calendar size={16} className="text-ink-soft" />
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-ink outline-none cursor-pointer appearance-none"
        >
          {monthOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="text-ink-soft" />
      </div>

      {/* Quick Actions */}
      {role && (["super_admin", "admin", "shipment_creator", "logistics_officer", "branch_manager"].includes(role)) && (
        <div className="flex gap-2 mb-4">
          {["super_admin", "admin", "shipment_creator", "logistics_officer"].includes(role) && (
            <Button size="sm" className="bg-navy hover:bg-[#0F2039] flex-1 h-11 rounded-xl font-semibold" onClick={() => navigate("/shipments/create")}>
              <Plus size={16} className="mr-1" /> New Shipment
            </Button>
          )}
          {["super_admin", "admin", "branch_manager", "logistics_officer"].includes(role) && (
            <Button size="sm" variant="outline" className="h-11 rounded-xl font-semibold border-[#E8E4DC] text-ink hover:bg-white" onClick={() => navigate("/reports")}>
              <BarChart3 size={16} className="mr-1" /> Reports
            </Button>
          )}
        </div>
      )}

      {/* Attention Alert — Overdue/Due Soon */}
      {attention && attention.total > 0 && (
        <Card className={`border mb-4 rounded-2xl shadow-none ${attention.overdue > 0 ? "bg-[#FBEAE9] border-[#F0CAC8]" : "bg-clay-soft border-[#EED9AE]"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {attention.overdue > 0 ? (
                <><AlertTriangle size={18} className="text-[#B3261E]" /><span className="text-sm font-bold font-display text-[#8A241D]">Attention Required</span></>
              ) : (
                <><Timer size={18} className="text-[#B7791F]" /><span className="text-sm font-bold font-display text-[#8A5A15]">Deliveries Due Soon</span></>
              )}
            </div>
            <div className="flex gap-4 text-center mb-3">
              {attention.overdue > 0 && (
                <div><p className="text-2xl font-bold font-display text-[#B3261E]">{attention.overdue}</p><p className="text-[10px] text-[#8A241D]">Overdue</p></div>
              )}
              {attention.dueSoon > 0 && (
                <div><p className="text-2xl font-bold font-display text-[#B7791F]">{attention.dueSoon}</p><p className="text-[10px] text-[#8A5A15]">Due within 24h</p></div>
              )}
              {attention.onTrack > 0 && (
                <div><p className="text-2xl font-bold font-display text-[#1E7B4D]">{attention.onTrack}</p><p className="text-[10px] text-[#1E7B4D]">On track</p></div>
              )}
            </div>
            <Button size="sm" className={`w-full rounded-xl font-semibold ${attention.overdue > 0 ? "bg-[#B3261E] hover:bg-[#8A241D]" : "bg-clay hover:bg-[#A85F32]"}`}
              onClick={() => navigate("/shipments")}>
              View Shipments
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border border-[#E8E4DC] shadow-none rounded-2xl">
            <CardContent className="p-3.5">
              <div className={`w-8 h-8 rounded-[9px] flex items-center justify-center mb-2 ${kpi.chip}`}>
                <kpi.icon size={16} className={kpi.iconColor} />
              </div>
              <p className="text-[11px] text-ink-soft mb-0.5">{kpi.label}</p>
              <p className="text-2xl font-bold font-display text-ink">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role-specific sections */}
      {role === "driver" && (
        <Card className="border-0 shadow-none mb-4 rounded-2xl bg-navy text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">My Active Deliveries</p>
                <p className="text-3xl font-bold font-display">{stats?.active ?? 0}</p>
              </div>
              <Truck size={32} className="opacity-50" />
            </div>
            <Button size="sm" variant="secondary" className="mt-3 w-full bg-white/15 hover:bg-white/25 text-white border-0 rounded-xl font-semibold"
              onClick={() => navigate("/driver/deliveries")}>View My Deliveries</Button>
          </CardContent>
        </Card>
      )}

      {role === "warehouse_supply" && (
        <Card className="border border-[#EED9AE] shadow-none mb-4 rounded-2xl bg-clay-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-[#B7791F]" />
              <span className="text-sm font-bold font-display text-[#8A5A15]">Shipments Need Processing</span>
            </div>
            <p className="text-xs text-[#8A5A15] mb-3">{stats?.created ?? 0} shipments waiting for item count and label</p>
            <Button size="sm" className="w-full bg-clay hover:bg-[#A85F32] rounded-xl font-semibold" onClick={() => navigate("/shipments")}>
              <Boxes size={14} className="mr-1" /> Process Shipments
            </Button>
          </CardContent>
        </Card>
      )}

      {role === "branch_manager" && (attention?.awaitingAcknowledgement ?? 0) > 0 && (
        <Card className="border border-[#CBE8D6] shadow-none mb-4 rounded-2xl bg-[#E7F3EC]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} className="text-[#1E7B4D]" />
              <span className="text-sm font-bold font-display text-[#155C39]">Awaiting Your Acknowledgement</span>
            </div>
            <p className="text-xs text-[#155C39] mb-3">{attention?.awaitingAcknowledgement ?? 0} shipment(s) delivered to your branch, ready to acknowledge</p>
            <Button size="sm" className="w-full bg-[#1E7B4D] hover:bg-[#155C39] rounded-xl font-semibold" onClick={() => navigate("/shipments")}>
              View Shipments
            </Button>
          </CardContent>
        </Card>
      )}

      {role === "logistics_officer" && (
        <Card className="border border-navy-soft shadow-none mb-4 rounded-2xl bg-navy-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={18} className="text-navy" />
              <span className="text-sm font-bold font-display text-navy">Ready for 3PL Assignment</span>
            </div>
            <p className="text-xs text-navy/80 mb-3">{stats?.labeled ?? 0} labeled shipments need 3PL</p>
            <Button size="sm" className="w-full bg-navy hover:bg-[#0F2039] rounded-xl font-semibold" onClick={() => navigate("/shipments")}>
              Assign to 3PL
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Admin stats */}
      {isAdmin && userStats && (
        <Card className="border border-[#E8E4DC] shadow-none mb-4 rounded-2xl">
          <CardContent className="p-3.5">
            <h3 className="text-[11px] font-bold text-ink-soft mb-2 tracking-wide uppercase">System Overview</h3>
            <div className="flex justify-between text-center">
              <div><p className="text-lg font-bold font-display text-ink">{userStats.total}</p><p className="text-[10px] text-ink-soft">Users</p></div>
              <div><p className="text-lg font-bold font-display text-[#B7791F]">{userStats.pending}</p><p className="text-[10px] text-ink-soft">Pending</p></div>
              <div><p className="text-lg font-bold font-display text-[#1E7B4D]">{userStats.active}</p><p className="text-[10px] text-ink-soft">Active</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Shipments */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold font-display text-ink">Recent Shipments</h2>
        <button onClick={() => navigate("/shipments")} className="text-xs font-semibold text-clay hover:underline">See All</button>
      </div>
      <div className="space-y-2">
        {recentShipments?.shipments?.length === 0 && <p className="text-sm text-ink-soft text-center py-4">No shipments yet</p>}
        {recentShipments?.shipments?.map(s => (
          <Card key={s.id} className="border border-[#E8E4DC] shadow-none rounded-2xl cursor-pointer hover:border-navy/30 transition-colors" onClick={() => navigate(`/shipments/${s.id}`)}>
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold font-display text-ink">{s.trackingId || `#${s.id}`}</span>
                  <Badge className={`text-[9px] rounded-full ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                </div>
                <p className="text-[11px] text-ink-soft mt-0.5">{s.destinationBranch} {s.receiverName ? `- ${s.receiverName}` : ""}</p>
              </div>
              <Package size={16} className="text-ink-soft/50" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
