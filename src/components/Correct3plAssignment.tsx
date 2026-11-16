import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_LABELS } from "@contracts/constants";
import { tplCorrectionBlockReason } from "@contracts/tpl-correction";
import { toast } from "sonner";

type Props = {
  shipment: Parameters<typeof tplCorrectionBlockReason>[0] & { id: number; trackingId: string | null; tplName: string | null };
};
export function Correct3plAssignment({ shipment }: Props) {
  const [snapshot, setSnapshot] = useState<{ tplId: number; status: string; name: string } | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const utils = trpc.useUtils();
  const companies = trpc.tpl.list.useQuery(undefined, { enabled: snapshot !== null });
  const correction = trpc.shipment.correct3plAssignment.useMutation({
    retry: false,
    onSuccess: async result => {
      setSnapshot(null);
      await Promise.all([utils.shipment.invalidate(), utils.report.invalidate()]);
      toast.success(`3PL corrected to ${result.tplName}. Delivery progress and driver history were kept.`);
    },
  });
  const blocked = tplCorrectionBlockReason(shipment);
  if (blocked) return <p className="text-xs text-ink-soft mt-3">3PL correction: {blocked}</p>;
  return <>
    <Button variant="outline" size="sm" className="mt-3" onClick={() => {
      correction.reset(); setTarget(""); setReason(""); setConfirmed(false);
      setSnapshot({ tplId: shipment.tplId!, status: shipment.status, name: shipment.tplName || "Current 3PL" });
    }}>Correct 3PL assignment</Button>
    <Dialog open={snapshot !== null} onOpenChange={open => { if (!open && !correction.isPending) setSnapshot(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Correct 3PL assignment</DialogTitle>
          <DialogDescription>Correct the company for {shipment.trackingId || `shipment #${shipment.id}`} without restarting delivery.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault();
          if (!snapshot || !target || !confirmed || correction.isPending) return;
          correction.mutate({ shipmentId: shipment.id, expectedTplId: snapshot.tplId, expectedStatus: snapshot.status, correctTplId: Number(target), reason: reason.trim() });
        }}>
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950 space-y-1">
            <p>Current company: <strong>{snapshot?.name}</strong></p>
            <p>Delivery stage stays: <strong>{STATUS_LABELS[snapshot?.status || ""] || snapshot?.status}</strong></p>
            <p>Pickup and drop-off history, driver, quantities, dates and tracking ID are preserved.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="correct-tpl">Correct 3PL company</Label>
            <select id="correct-tpl" className="w-full min-h-11 rounded-md border bg-white px-3 text-sm" required disabled={companies.isLoading || !!companies.error || correction.isPending} value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">Choose the company that should be assigned</option>
              {companies.data?.filter(c => c.status === "active" && c.id !== snapshot?.tplId).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
            {companies.error && <p role="alert" className="text-sm text-red-700">Could not load 3PL companies. <button type="button" className="underline" onClick={() => void companies.refetch()}>Try again</button></p>}
          </div>
          <div className="space-y-2"><Label htmlFor="tpl-correction-reason">Reason for correction</Label><Textarea id="tpl-correction-reason" required minLength={10} maxLength={1000} disabled={correction.isPending} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the assignment mistake and which company actually received the goods." /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required disabled={correction.isPending} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>I have verified the correct company and the existing pickup/drop-off records.</span></label>
          <p className="text-xs text-ink-soft">The change and your reason will be recorded in shipment history. No new pickup, drop-off or push notification is triggered.</p>
          {correction.error && <p role="alert" className="text-sm text-red-700">{correction.error.message}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={correction.isPending} onClick={() => setSnapshot(null)}>Cancel</Button><Button type="submit" className="bg-navy" disabled={!confirmed || !target || reason.trim().length < 10 || correction.isPending || !!companies.error}>{correction.isPending ? "Correcting…" : "Save correction"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
