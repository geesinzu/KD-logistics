import { Link, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { currentShipmentMonth, validShipmentMonth, shipmentMonthLabel, shipmentListUrl } from "@contracts/shipment-navigation";
import { Package, Truck, Clock, CheckCircle, Plus, Calendar, BarChart3, Bell, Copy, ArrowRight, ScanLine, Users, Building2 } from "lucide-react";
import { toast } from "sonner";

function getMonthYearOptions(selectedMonth: string) {
  const options: { label: string; value: string }[] = [];
  const now = new Date(`${currentShipmentMonth()}-01T00:00:00Z`);
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    options.push({
      label: d.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "long", year: "numeric" }),
      value: `${year}-${month}`,
    });
  }
  if (!options.some(option => option.value === selectedMonth)) {
    options.push({ value: selectedMonth, label: shipmentMonthLabel(selectedMonth) });
  }
  return options;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const role = user?.role;
  const [params, setParams] = useSearchParams();
  const rawMonth = params.get("month");
  const selectedMonth = validShipmentMonth(rawMonth) ? rawMonth : currentShipmentMonth();
  const setSelectedMonth = (value: string) => setParams({ month: value });
  const [year, month] = selectedMonth.split("-").map(Number);
  const statsQuery = trpc.shipment.stats.useQuery({ year, month });
  const attentionQuery = trpc.shipment.attentionStats.useQuery();
  const recentQuery = trpc.shipment.list.useQuery({ page: 1, limit: 10, year, month });
  const userStatsQuery = trpc.user.stats.useQuery(undefined, { enabled: isAdmin });
  const stats = statsQuery.data;
  const attention = attentionQuery.data;
  const userStats = userStatsQuery.data;
  const canCreate = !!role && ["super_admin", "admin", "shipment_creator", "logistics_officer"].includes(role);
  const canReport = !!role && ["super_admin", "admin", "logistics_officer", "viewer"].includes(role);
  const kpis = [
    { label: "Active shipments", value: stats?.active, icon: Package, note: "Awaiting completion", path: shipmentListUrl("active", selectedMonth) },
    { label: "Pending label", value: stats?.created, icon: Clock, note: "Ready for warehouse processing", path: shipmentListUrl("created", selectedMonth) },
    { label: "In transit", value: stats?.inTransit, icon: Truck, note: "Moving through your network", path: shipmentListUrl("in_transit_with_3pl", selectedMonth) },
    { label: "Delivered", value: stats?.delivered, icon: CheckCircle, note: "Delivered or completed", path: shipmentListUrl("delivered_or_completed", selectedMonth) },
  ];
  const tasks = [
    ...(attention && attention.overdue > 0 ? [{ title: "Overdue deliveries", count: attention.overdue, description: "shipments need follow-up", icon: Clock, path: shipmentListUrl("", "all") }] : []),
    ...(attention && attention.dueSoon > 0 ? [{ title: "Due within 24 hours", count: attention.dueSoon, description: "deliveries to keep an eye on", icon: Truck, path: shipmentListUrl("", "all") }] : []),
    ...(role === "branch_manager" && (attention?.awaitingAcknowledgement ?? 0) > 0 ? [{ title: "Your branch needs you", count: attention?.awaitingAcknowledgement ?? 0, description: "shipments to acknowledge or send onward", icon: Building2, path: shipmentListUrl("", "all") }] : []),
    ...(role === "warehouse_supply" ? [{ title: "Ready for processing", count: stats?.created ?? 0, description: "shipments need item counts and labels", icon: Package, path: shipmentListUrl("created", selectedMonth) }] : []),
    ...(role === "logistics_officer" ? [{ title: "Assign a logistics partner", count: stats?.labeled ?? 0, description: "labeled shipments ready for a 3PL", icon: Truck, path: shipmentListUrl("labeled", selectedMonth) }] : []),
    ...(role === "driver" ? [{ title: "Your active deliveries", count: stats?.active ?? 0, description: "deliveries in your queue", icon: Truck, path: "/driver/deliveries" }] : []),
  ];

  return (
    <div className="operations-dashboard">
      <p className="operations-eyebrow">YOUR OPERATIONS, AT A GLANCE</p>
      <div className="operations-heading">
        <div><h1>Welcome back, {user?.name.split(" ")[0] || "there"}.</h1><p>Let’s keep things moving. Here’s your selected month at a glance.</p></div>
        <label className="operations-month"><Calendar size={16} /><span className="sr-only">Dashboard creation month</span><select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>{getMonthYearOptions(selectedMonth).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
      </div>
      <div className="operations-actions">
        {canCreate && <><Link className="operations-button primary" to="/shipments/create"><Plus size={16} />New shipment</Link><Link className="operations-button" to="/shipments/create-bulk"><Copy size={15} />Bulk create</Link></>}
        <Link className="operations-button" to="/scan"><ScanLine size={16} />Scan shipment</Link>
        {canReport && <Link className="operations-button" to="/reports"><BarChart3 size={16} />Reports</Link>}
      </div>
      {statsQuery.error && <div className="operations-message" role="alert">Shipment totals could not be loaded. <button className="underline" onClick={() => void statsQuery.refetch()}>Try again</button></div>}
      <div className="operations-kpis" aria-label="Monthly shipment totals" aria-busy={statsQuery.isLoading}>
        {kpis.map(kpi => <Link className="operations-kpi operations-kpi-link" key={kpi.label} to={kpi.path} aria-label={`View ${kpi.label.toLowerCase()} created in ${shipmentMonthLabel(selectedMonth)}`}><div className="operations-kpi-top"><span>{kpi.label}</span><kpi.icon size={18} /></div><strong>{kpi.value ?? "—"}</strong><small>{statsQuery.isLoading ? "Loading monthly totals…" : kpi.note}</small><span className="operations-kpi-hint">View shipments →</span></Link>)}
      </div>
      <div className="operations-grid">
        <section className="operations-panel" aria-labelledby="recent-heading">
          <div className="operations-panel-head"><div><h2 id="recent-heading">Recent shipments</h2><p>Shipments created in your selected month.</p></div><Link to={shipmentListUrl("", selectedMonth)}>View all →</Link></div>
          {recentQuery.isLoading ? <p className="operations-message" role="status">Loading shipments…</p> : recentQuery.error ? <p className="operations-message" role="alert">Could not load shipments. <button className="underline" onClick={() => void recentQuery.refetch()}>Try again</button></p> : recentQuery.data?.shipments.length === 0 ? <p className="operations-message">No shipments for this month. Choose another month to see earlier activity.</p> : <div className="operations-table-wrap"><table className="operations-table"><thead><tr><th scope="col">Tracking ID</th><th scope="col">Destination</th><th scope="col">Status</th></tr></thead><tbody>{recentQuery.data?.shipments.map(s => <tr key={s.id}><td><Link className="hover:underline" to={`/shipments/${s.id}`}>{s.trackingId || `#${s.id}`}</Link></td><td>{s.destinationBranch}{s.receiverName && <small>{s.receiverName}</small>}</td><td><span className={`operations-status ${STATUS_COLORS[s.status] || "bg-gray-100 text-gray-700"}`}>{STATUS_LABELS[s.status] || s.status}</span></td></tr>)}</tbody></table></div>}
        </section>
        <div className="operations-side">
          <section className="operations-panel" aria-labelledby="action-heading"><div className="operations-panel-head"><div><h2 id="action-heading">Action needed</h2><p>Live follow-ups and monthly work queues.</p></div><Clock size={17} className="text-amber-600" /></div>
            {attentionQuery.error ? <p className="operations-message" role="alert">Could not load follow-ups. <button className="underline" onClick={() => void attentionQuery.refetch()}>Try again</button></p> : attentionQuery.isLoading || statsQuery.isLoading ? <p className="operations-message" role="status">Checking your queues…</p> : tasks.length ? tasks.map(task => <div className="operations-task" key={task.title}><span className="operations-task-icon"><task.icon size={17} /></span><div><h3>{task.title}</h3><p>{task.count} {task.description}</p></div><Link to={task.path} aria-label={task.title}><ArrowRight size={17} /></Link></div>) : <p className="operations-message">You’re up to date. No current follow-ups to show.</p>}
            {attention && attention.onTrack > 0 && <p className="operations-note">{attention.onTrack} deliveries are on track.</p>}
          </section>
          {isAdmin && <section className="operations-panel" aria-labelledby="team-heading"><div className="operations-panel-head"><div><h2 id="team-heading">Your operations team</h2><p>The people behind every delivery.</p></div><Link to="/users" aria-label="Manage users"><Users size={18} /></Link></div>
            {userStatsQuery.isLoading ? <p className="operations-message">Loading team overview…</p> : userStatsQuery.error ? <p className="operations-message" role="alert">Could not load team totals. <button className="underline" onClick={() => void userStatsQuery.refetch()}>Try again</button></p> : userStats && <div className="operations-team-stats"><div><strong>{userStats.total}</strong><span>Staff members</span></div><div><strong>{userStats.pending}</strong><span>Pending approval</span></div><div><strong>{userStats.active}</strong><span>Active</span></div></div>}
          </section>}
        </div>
      </div>
      {role === "super_admin" && <details className="operations-tools"><summary>Administrator tools</summary><div><TplReminderTestButton /></div></details>}
      <footer className="operations-footer"><span>KEDI Healthcare Logistics · Every shipment, a promise.</span><span>Creation month: {shipmentMonthLabel(selectedMonth)}</span></footer>
    </div>
  );
}

function TplReminderTestButton() {
  const runCheck = trpc.shipment.runTplReminderCheck.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.withinOperatingHours
          ? `Checked ${result.shipmentsChecked} shipment(s) · ${result.remindersSent} reminder(s), ${result.escalationsSent} escalation(s) sent`
          : `Checked ${result.shipmentsChecked} shipment(s) · outside 7am-7pm Lagos, so nothing was sent (this is expected, not an error)`
      );
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Card className="border border-dashed border-[#E8E4DC] shadow-none mb-4 rounded-2xl">
      <CardContent className="p-3.5">
        <h3 className="text-[11px] font-bold text-ink-soft mb-2 tracking-wide uppercase">Test: 3PL Reminder Check</h3>
        <p className="text-xs text-ink-soft mb-2">Runs the same check that happens automatically every 30 minutes, right now.</p>
        <Button
          size="sm" variant="outline" className="rounded-xl font-semibold border-[#E8E4DC]"
          disabled={runCheck.isPending}
          onClick={() => runCheck.mutate()}
        >
          <Bell size={14} className="mr-1" /> {runCheck.isPending ? "Running..." : "Run check now"}
        </Button>
      </CardContent>
    </Card>
  );
}
