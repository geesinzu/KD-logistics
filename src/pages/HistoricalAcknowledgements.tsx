import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRMATION = "ACKNOWLEDGE BEFORE NOVEMBER 2026";

export default function HistoricalAcknowledgements() {
  const [confirmation, setConfirmation] = useState("");
  const [page, setPage] = useState(0);
  const preview = trpc.maintenance.historicalAckPreview.useQuery(undefined, {
    enabled: false, retry: false, refetchOnWindowFocus: false, staleTime: 0, gcTime: 0,
  });
  const apply = trpc.maintenance.historicalAckApply.useMutation({
    retry: false,
    onSettled: async () => { setConfirmation(""); await preview.refetch(); },
  });
  const data = apply.data?.completed ? apply.data : preview.data;
  const pending = preview.isFetching || apply.isPending;
  const plan = data && !data.completed ? data : undefined;

  return (
    <div className="management-page space-y-5">
      <Link to="/profile" className="text-sm text-blue-800 underline">Back to profile</Link>
      <h1 className="management-title">Historical acknowledgements</h1>
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <p>One-time correction for deliveries before <strong>1 November 2026, Nigeria time</strong>. Acknowledgement dates will match their existing delivery dates.</p>
        <p className="text-sm text-gray-600">November deliveries stay unchanged. Hub arrivals, missing delivery dates, outstanding quantities, and inconsistent acknowledgements are left for review.</p>
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><strong>No notifications:</strong> this sends no push, email, or in-app notifications to staff or 3PL users. Corrections remain visible in shipment history. Original records are backed up in the administrator audit log.</p>
        {!data?.completed && <Button disabled={pending} variant="outline" onClick={() => { setConfirmation(""); setPage(0); apply.reset(); void preview.refetch(); }}>{preview.isFetching ? "Loading preview…" : "Preview eligible deliveries"}</Button>}
      </div>
      {preview.error && <p role="alert" className="text-red-700">Preview unavailable: {preview.error.message}</p>}
      {apply.error && <p role="alert" className="text-red-700">{apply.error.message}</p>}
      {data?.completed && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-2">
        <h2 className="font-semibold">Correction completed</h2>
        <p>{data.count} shipments acknowledged using their delivery dates. No notifications were sent.</p>
        <p className="text-sm">This action is now disabled. The temporary tool can be removed while keeping the audit records.</p>
      </div>}
      {plan && !preview.error && <>
        <section className="rounded-xl border bg-white p-5 space-y-3" aria-labelledby="preview-title">
          <h2 id="preview-title" className="font-semibold">{plan.count} eligible deliveries</h2>
          <p className="text-sm text-gray-600">These shipments will change from Delivered to Completed. Each acknowledgement date below is the existing delivery date, shown in Nigeria time.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="p-2">Shipment</th><th className="p-2">Delivery / acknowledgement date</th></tr></thead>
              <tbody>{plan.records.slice(page * 50, (page + 1) * 50).map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.trackingId || row.id}</td><td className="p-2 whitespace-nowrap">{row.deliveredAt}</td></tr>)}</tbody>
            </table>
          </div>
          {plan.count === 0 && <p>No eligible deliveries. Nothing will be changed.</p>}
          {plan.count > 50 && <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0 || pending} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page + 1} of {Math.ceil(plan.count / 50)}</span><Button variant="outline" disabled={(page + 1) * 50 >= plan.count || pending} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
        </section>
        {plan.skipped.length > 0 && <details className="rounded-xl border bg-white p-5">
          <summary className="cursor-pointer font-semibold">{plan.skipped.length} deliveries left for review</summary>
          <ul className="mt-3 max-h-64 overflow-auto space-y-2 text-sm">{plan.skipped.map(row => <li key={row.id}>{row.trackingId || row.id}: {row.reason.replaceAll("_", " ")}</li>)}</ul>
        </details>}
        {plan.count > 0 && <section className="rounded-xl border bg-white p-5 space-y-3">
          <Label htmlFor="ack-confirmation">To apply once, type: {CONFIRMATION}</Label>
          <Input id="ack-confirmation" autoComplete="off" value={confirmation} disabled={pending} onChange={e => setConfirmation(e.target.value)} />
          <Button className="bg-[#003B7A]" disabled={pending || confirmation !== CONFIRMATION} onClick={() => apply.mutate({ digest: plan.digest, confirmation: CONFIRMATION })}>{apply.isPending ? "Applying correction…" : "Apply correction without notifications"}</Button>
          <p className="text-sm text-gray-500">If shipment details have changed, the update stops and asks you to review a fresh preview.</p>
        </section>}
      </>}
    </div>
  );
}
