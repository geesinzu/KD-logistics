import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, Package } from "lucide-react";

const chartConfig = {
  created: { label: "Created", color: "#2a78d6" },
  delivered: { label: "Delivered", color: "#008300" },
} satisfies ChartConfig;

function onTimeRateColor(rate: number | null) {
  if (rate === null) return "bg-gray-100 text-gray-500";
  if (rate >= 90) return "bg-green-50 text-green-700";
  if (rate >= 70) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export default function Reports() {
  const navigate = useNavigate();
  const [months, setMonths] = useState(6);
  const { data: analytics, isLoading } = trpc.shipment.analytics.useQuery({ months });

  const maxBranchTotal = Math.max(1, ...(analytics?.byBranch.map(b => b.total) ?? [1]));

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Reports</h1>
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
                  <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-indigo-700" /><span className="text-[10px] text-gray-500">Avg. Delivery Time</span></div>
                  <p className="text-2xl font-bold text-[#1E293B]">{analytics.avgDeliveryDays !== null ? `${analytics.avgDeliveryDays}d` : "N/A"}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className="text-red-700" /><span className="text-[10px] text-gray-500">Late Deliveries</span></div>
                  <p className="text-2xl font-bold text-[#1E293B]">{analytics.late}</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly trend */}
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
              </CardContent>
            </Card>

            {/* By branch */}
            {analytics.byBranch.length > 0 && (
              <Card className="border-0 shadow-sm mb-4">
                <CardContent className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Shipments by Branch</h3>
                  {analytics.byBranch.map(b => (
                    <div key={b.branchId} className="mb-3 last:mb-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[#1E293B]">{b.branchName}</span>
                        <span className="text-gray-500">{b.total} total &middot; {b.delivered} delivered</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2a78d6] rounded-full" style={{ width: `${Math.round((b.total / maxBranchTotal) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* By 3PL */}
            {analytics.byTpl.length > 0 && (
              <Card className="border-0 shadow-sm mb-4">
                <CardContent className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">3PL Performance</h3>
                  {analytics.byTpl.map(t => (
                    <div key={t.tplId} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#1E293B]">{t.tplName}</p>
                        <p className="text-[11px] text-gray-500">{t.total} shipments</p>
                      </div>
                      <Badge className={`text-[10px] ${onTimeRateColor(t.onTimeRate)}`}>
                        {t.onTimeRate !== null ? `${t.onTimeRate}% on-time` : "No data"}
                      </Badge>
                    </div>
                  ))}
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
          </>
        )}
      </div>
    </div>
  );
}
