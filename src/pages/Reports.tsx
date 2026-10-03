import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import {
  ArrowLeft, Clock, CheckCircle2, AlertTriangle, Package, Download, Printer,
  TrendingUp, ChevronDown, ChevronUp, TriangleAlert, Timer, ThumbsUp,
} from "lucide-react";

const chartConfig = {
  created: { label: "Created", color: "#2a78d6" },
  delivered: { label: "Delivered", color: "#008300" },
} satisfies ChartConfig;

const PRIORITY_LABELS: Record<string, string> = { urgent: "Urgent", normal: "Normal", low: "Low" };

function onTimeRateColor(rate: number | null) {
  if (rate === null) return "bg-gray-100 text-gray-500";
  if (rate >= 90) return "bg-green-50 text-green-700";
  if (rate >= 70) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

interface TplRow {
  tplId: number; tplName: string; total: number; onTimeRate: number | null;
  avgTransitDays: number | null; reminders: number; escalations: number; branchFallbacks: number;
}
interface BranchRow {
  branchId: number; branchName: string; total: number; delivered: number; active: number;
  branchFallbacks: number; hubDwellHours: number | null;
}
interface Insight { tone: "bad" | "warn" | "good"; title: string; body: string }

function toneStyles(tone: Insight["tone"]) {
  if (tone === "bad") return { border: "border-l-red-500", iconBg: "bg-red-50", iconColor: "text-red-600", Icon: TriangleAlert };
  if (tone === "warn") return { border: "border-l-amber-500", iconBg: "bg-amber-50", iconColor: "text-amber-600", Icon: Timer };
  return { border: "border-l-green-500", iconBg: "bg-green-50", iconColor: "text-green-600", Icon: ThumbsUp };
}

function buildInsights(byTpl: TplRow[], byBranch: BranchRow[]): Insight[] {
  const insights: Insight[] = [];

  const worstEscalations = [...byTpl].filter(t => t.escalations > 0).sort((a, b) => b.escalations - a.escalations)[0];
  if (worstEscalations) {
    insights.push({
      tone: "bad",
      title: `${worstEscalations.tplName} needed ${worstEscalations.escalations} escalation${worstEscalations.escalations === 1 ? "" : "s"}`,
      body: `${worstEscalations.reminders} reminder${worstEscalations.reminders === 1 ? "" : "s"} sent before ops had to step in this period.`,
    });
  }

  const worstDwell = [...byBranch].filter(b => b.hubDwellHours !== null).sort((a, b) => (b.hubDwellHours ?? 0) - (a.hubDwellHours ?? 0))[0];
  if (worstDwell && worstDwell.hubDwellHours !== null) {
    insights.push({
      tone: "warn",
      title: `${worstDwell.branchName} hub dwell: ${worstDwell.hubDwellHours}h`,
      body: "Average time between arrival at the hub and onward dispatch this period.",
    });
  }

  const worstFallback = [...byTpl].filter(t => t.branchFallbacks > 0).sort((a, b) => b.branchFallbacks - a.branchFallbacks)[0];
  if (worstFallback) {
    insights.push({
      tone: "warn",
      title: `${worstFallback.branchFallbacks} branch fallback${worstFallback.branchFallbacks === 1 ? "" : "s"} tied to ${worstFallback.tplName}`,
      body: "Branches confirmed delivery themselves because this 3PL hadn't posted an update.",
    });
  }

  const bestPerformer = [...byTpl]
    .filter(t => t.total >= 3 && t.escalations === 0 && t.onTimeRate !== null)
    .sort((a, b) => (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0))[0];
  if (bestPerformer) {
    insights.push({
      tone: "good",
      title: `${bestPerformer.tplName}: ${bestPerformer.onTimeRate}% on-time, zero escalations`,
      body: "Best performer this period — worth highlighting in the next partner review.",
    });
  }

  return insights.slice(0, 4);
}

function buildSummary(onTimeRate: number | null, byTpl: TplRow[]): string {
  if (onTimeRate === null) return "No deliveries finished in this period yet.";
  const worst = [...byTpl].filter(t => t.total >= 3 && t.onTimeRate !== null).sort((a, b) => (a.onTimeRate ?? 0) - (b.onTimeRate ?? 0))[0];
  let s = `Deliveries held at a ${onTimeRate}% on-time rate this period.`;
  if (worst && worst.onTimeRate !== null && worst.onTimeRate < onTimeRate) {
    s += ` The softest spot was ${worst.tplName}, whose on-time rate fell to ${worst.onTimeRate}% across ${worst.total} shipments.`;
  }
  return s;
}

function csvEscape(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Reports() {
  const navigate = useNavigate();
  const [months, setMonths] = useState(6);
  const [showAllTpl, setShowAllTpl] = useState(false);
  const [showAllBranch, setShowAllBranch] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: analytics, isLoading } = trpc.shipment.analytics.useQuery({ months });

  const insights = useMemo(() => analytics ? buildInsights(analytics.byTpl, analytics.byBranch) : [], [analytics]);
  const summary = useMemo(() => analytics ? buildSummary(analytics.onTimeRate, analytics.byTpl) : "", [analytics]);

  const topTpl = analytics?.byTpl.slice(0, 3) ?? [];
  const topBranch = analytics?.byBranch.slice(0, 3) ?? [];

  function exportCsv() {
    if (!analytics) return;
    const rows: string[] = [];
    rows.push(`KD Logistics Report,Generated ${new Date().toLocaleString("en-NG")},Period: last ${months} month(s)`);
    rows.push("");
    rows.push("KPI,Value");
    rows.push(`Total Shipments,${analytics.totalShipments}`);
    rows.push(`On-Time Rate,${analytics.onTimeRate !== null ? analytics.onTimeRate + "%" : "N/A"}`);
    rows.push(`Avg 3PL Transit (days),${analytics.avgTplTransitDays ?? "N/A"}`);
    rows.push(`Avg KEDI Processing (days),${analytics.avgKediProcessingDays ?? "N/A"}`);
    rows.push(`Late Deliveries,${analytics.late}`);
    rows.push("");
    rows.push("3PL,Shipments,On-Time %,Avg Transit (days),Reminders Sent,Escalations,Branch Fallbacks");
    for (const t of analytics.byTpl) {
      rows.push([t.tplName, t.total, t.onTimeRate ?? "", t.avgTransitDays ?? "", t.reminders, t.escalations, t.branchFallbacks].map(csvEscape).join(","));
    }
    rows.push("");
    rows.push("Branch,Received,Completed,Branch Fallbacks,Hub Dwell (avg hrs)");
    for (const b of analytics.byBranch) {
      rows.push([b.branchName, b.total, b.delivered, b.branchFallbacks, b.hubDwellHours ?? ""].map(csvEscape).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kd-logistics-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const content = printRef.current;
    if (!content || !analytics) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>KD Logistics Report</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1E293B; }
          .report { max-width: 190mm; margin: 0 auto; }
          .header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 3px solid #0F172A; }
          .logo-box { width: 44px; height: 44px; background: #0F172A; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
          .header-text h1 { font-size: 18px; font-weight: 800; margin: 0; }
          .header-text p { font-size: 11px; color: #64748B; margin: 2px 0 0; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          .kpi-box { border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
          .kpi-label { font-size: 9px; text-transform: uppercase; color: #94A3B8; font-weight: 700; }
          .kpi-value { font-size: 20px; font-weight: 800; margin-top: 4px; }
          h2 { font-size: 13px; font-weight: 800; margin: 18px 0 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; font-size: 9px; text-transform: uppercase; color: #94A3B8; padding: 6px 8px; border-bottom: 1px solid #CBD5E1; }
          td { padding: 7px 8px; border-bottom: 1px solid #F1F5F9; }
          .summary { font-size: 11px; color: #334155; line-height: 1.6; background: #F8FAFC; border-radius: 8px; padding: 12px; margin-bottom: 4px; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 9px; color: #94A3B8; }
        </style>
      </head>
      <body>
        ${content.innerHTML}
        <script>window.onload = () => { setTimeout(() => { window.print(); }, 300); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold flex-1">Reports</h1>
        {analytics && (
          <div className="flex gap-1.5">
            <button onClick={exportCsv} className="p-1.5 rounded-md hover:bg-white/10" title="Export CSV"><Download size={16} /></button>
            <button onClick={exportPdf} className="p-1.5 rounded-md hover:bg-white/10" title="Export PDF"><Printer size={16} /></button>
          </div>
        )}
      </div>

      <div className="p-4">
        {isLoading && <p className="text-sm text-gray-400 text-center py-8">Loading...</p>}

        {analytics && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1"><Package size={16} className="text-blue-700" /><span className="text-[10px] text-gray-500">Total Shipments</span></div>
                  <p className="text-2xl font-bold text-[#1E293B]">{analytics.totalShipments}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={16} className="text-green-700" /><span className="text-[10px] text-gray-500">On-Time Rate</span></div>
                  <p className="text-2xl font-bold text-[#1E293B]">{analytics.onTimeRate !== null ? `${analytics.onTimeRate}%` : "N/A"}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-indigo-700" /><span className="text-[10px] text-gray-500">Avg. 3PL Transit</span></div>
                  <p className="text-2xl font-bold text-[#1E293B]">{analytics.avgTplTransitDays !== null ? `${analytics.avgTplTransitDays}d` : "N/A"}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className="text-red-700" /><span className="text-[10px] text-gray-500">Late Deliveries</span></div>
                  <p className="text-2xl font-bold text-[#1E293B]">{analytics.late}</p>
                </CardContent>
              </Card>
            </div>

            {/* Needs attention */}
            {insights.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Needs Your Attention</h3>
                <div className="flex flex-col gap-2">
                  {insights.map((ins, i) => {
                    const { border, iconBg, iconColor, Icon } = toneStyles(ins.tone);
                    return (
                      <Card key={i} className={`border-0 border-l-4 ${border} shadow-sm`}>
                        <CardContent className="p-3 flex gap-3">
                          <div className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center flex-shrink-0`}><Icon size={16} /></div>
                          <div>
                            <p className="text-xs font-bold text-[#1E293B]">{ins.title}</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">{ins.body}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Monthly trend + narrative */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase">Monthly Trend</h3>
                  <select
                    value={months}
                    onChange={e => setMonths(Number(e.target.value))}
                    className="text-xs bg-gray-50 rounded-md px-2 py-1 outline-none"
                  >
                    <option value={3}>3 months</option>
                    <option value={6}>6 months</option>
                    <option value={12}>12 months</option>
                  </select>
                </div>
                <ChartContainer config={chartConfig} className="h-56 w-full">
                  <BarChart data={analytics.monthly} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e1e0d9" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="created" fill="var(--color-created)" radius={4}>
                      <LabelList dataKey="created" position="top" fontSize={10} fill="#52514e" />
                    </Bar>
                    <Bar dataKey="delivered" fill="var(--color-delivered)" radius={4}>
                      <LabelList dataKey="delivered" position="top" fontSize={10} fill="#52514e" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-3 pt-3 border-t border-gray-100 flex items-start gap-1.5">
                  <TrendingUp size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  {summary}
                </p>
              </CardContent>
            </Card>

            {/* Where shipments stall */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Where Time Goes</h3>
                <p className="text-[11px] text-gray-400 mb-3">KEDI's own processing time vs. the 3PL's transit time, kept separate since shipments are batch-created before the warehouse or 3PL ever touch them</p>
                <div className="flex gap-3">
                  <div className="flex-1 bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase font-semibold">KEDI Processing</p>
                    <p className="text-xl font-bold text-[#1E293B] mt-1">{analytics.avgKediProcessingDays !== null ? `${analytics.avgKediProcessingDays}d` : "N/A"}</p>
                    <p className="text-[10px] text-gray-400">created → handed to 3PL</p>
                  </div>
                  <div className="flex-1 bg-blue-50 rounded-lg p-3">
                    <p className="text-[10px] text-blue-600 uppercase font-semibold">3PL Transit</p>
                    <p className="text-xl font-bold text-[#1E293B] mt-1">{analytics.avgTplTransitDays !== null ? `${analytics.avgTplTransitDays}d` : "N/A"}</p>
                    <p className="text-[10px] text-gray-400">handed off → delivered</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Priority breakdown */}
            {analytics.priorityBreakdown.length > 0 && (
              <Card className="border-0 shadow-sm mb-4">
                <CardContent className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">On-Time Rate by Priority</h3>
                  <div className="flex flex-col gap-2">
                    {analytics.priorityBreakdown.map(p => (
                      <div key={p.priority} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#1E293B]">{PRIORITY_LABELS[p.priority] || p.priority}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">{p.total} shipments</span>
                          <Badge className={`text-[10px] ${onTimeRateColor(p.onTimeRate)}`}>{p.onTimeRate !== null ? `${p.onTimeRate}%` : "N/A"}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 3PL snapshot */}
            {analytics.byTpl.length > 0 && (
              <Card className="border-0 shadow-sm mb-4">
                <CardContent className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">3PL Performance</h3>
                  {(showAllTpl ? analytics.byTpl : topTpl).map(t => (
                    <div key={t.tplId} className="py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[#1E293B]">{t.tplName}</p>
                        <Badge className={`text-[10px] ${onTimeRateColor(t.onTimeRate)}`}>
                          {t.onTimeRate !== null ? `${t.onTimeRate}% on-time` : "No data"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {t.total} shipments
                        {t.avgTransitDays !== null && ` · ${t.avgTransitDays}d avg transit`}
                        {t.reminders > 0 && ` · ${t.reminders} reminder${t.reminders === 1 ? "" : "s"}`}
                        {t.escalations > 0 && ` · ${t.escalations} escalation${t.escalations === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  ))}
                  {analytics.byTpl.length > 3 && (
                    <button onClick={() => setShowAllTpl(v => !v)} className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-2">
                      {showAllTpl ? "Show less" : `View all ${analytics.byTpl.length} partners`}
                      {showAllTpl ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Branch snapshot */}
            {analytics.byBranch.length > 0 && (
              <Card className="border-0 shadow-sm mb-4">
                <CardContent className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Branch Performance</h3>
                  {(showAllBranch ? analytics.byBranch : topBranch).map(b => (
                    <div key={b.branchId} className="py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[#1E293B] flex items-center gap-1.5">
                          {b.branchName}
                          {b.hubDwellHours !== null && <span className="text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5">HUB</span>}
                        </span>
                        <span className="text-gray-500">{b.total} total · {b.delivered} delivered</span>
                      </div>
                      {(b.hubDwellHours !== null || b.branchFallbacks > 0) && (
                        <p className="text-[10px] text-gray-400">
                          {b.hubDwellHours !== null && `${b.hubDwellHours}h avg dwell`}
                          {b.hubDwellHours !== null && b.branchFallbacks > 0 && " · "}
                          {b.branchFallbacks > 0 && `${b.branchFallbacks} branch fallback${b.branchFallbacks === 1 ? "" : "s"}`}
                        </p>
                      )}
                    </div>
                  ))}
                  {analytics.byBranch.length > 3 && (
                    <button onClick={() => setShowAllBranch(v => !v)} className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-2">
                      {showAllBranch ? "Show less" : `View all ${analytics.byBranch.length} branches`}
                      {showAllBranch ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Status breakdown */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Status Breakdown</h3>
                <div className="flex flex-wrap gap-2">
                  {analytics.statusBreakdown.map(s => (
                    <Badge key={s.status} className={`text-[10px] ${STATUS_COLORS[s.status] || ""}`}>
                      {STATUS_LABELS[s.status] || s.label} &middot; {s.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Hidden print-only content for PDF export */}
            <div style={{ display: "none" }}>
              <div ref={printRef} className="report">
                <div className="header">
                  <div className="logo-box">K</div>
                  <div className="header-text">
                    <h1>KEDI Healthcare Logistics — Performance Report</h1>
                    <p>Last {months} month{months === 1 ? "" : "s"} · Generated {new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                </div>

                <div className="kpi-grid">
                  <div className="kpi-box"><div className="kpi-label">Total Shipments</div><div className="kpi-value">{analytics.totalShipments}</div></div>
                  <div className="kpi-box"><div className="kpi-label">On-Time Rate</div><div className="kpi-value">{analytics.onTimeRate !== null ? `${analytics.onTimeRate}%` : "N/A"}</div></div>
                  <div className="kpi-box"><div className="kpi-label">Avg 3PL Transit</div><div className="kpi-value">{analytics.avgTplTransitDays !== null ? `${analytics.avgTplTransitDays}d` : "N/A"}</div></div>
                  <div className="kpi-box"><div className="kpi-label">Late</div><div className="kpi-value">{analytics.late}</div></div>
                </div>

                <p className="summary">{summary}</p>

                <h2>3PL Performance</h2>
                <table>
                  <thead><tr><th>3PL</th><th>Shipments</th><th>On-Time</th><th>Avg Transit</th><th>Reminders</th><th>Escalations</th><th>Fallbacks</th></tr></thead>
                  <tbody>
                    {analytics.byTpl.map(t => (
                      <tr key={t.tplId}>
                        <td>{t.tplName}</td>
                        <td>{t.total}</td>
                        <td>{t.onTimeRate !== null ? `${t.onTimeRate}%` : "—"}</td>
                        <td>{t.avgTransitDays !== null ? `${t.avgTransitDays}d` : "—"}</td>
                        <td>{t.reminders}</td>
                        <td>{t.escalations}</td>
                        <td>{t.branchFallbacks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h2>Branch Performance</h2>
                <table>
                  <thead><tr><th>Branch</th><th>Received</th><th>Completed</th><th>Fallbacks</th><th>Hub Dwell (avg)</th></tr></thead>
                  <tbody>
                    {analytics.byBranch.map(b => (
                      <tr key={b.branchId}>
                        <td>{b.branchName}{b.hubDwellHours !== null ? " (Hub)" : ""}</td>
                        <td>{b.total}</td>
                        <td>{b.delivered}</td>
                        <td>{b.branchFallbacks}</td>
                        <td>{b.hubDwellHours !== null ? `${b.hubDwellHours}h` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="footer">KEDI Healthcare Logistics &bull; Internal performance report &bull; Not for external distribution without review</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
