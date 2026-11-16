import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { partialQuantityBlockReason } from "@contracts/partial-delivery";
import type { DeliveryQuantityState } from "@contracts/partial-delivery";
import { toast } from "sonner";

type Props = { shipment: DeliveryQuantityState & { id: number; trackingId: string | null } };
export function CorrectPartialTotal({ shipment }: Props) {
  const [snapshot, setSnapshot] = useState<Props["shipment"] | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const utils = trpc.useUtils();
  const correction = trpc.shipment.correctPartialDeliveryTotal.useMutation({ retry: false, onSuccess: async result => {
    setSnapshot(null); await Promise.all([utils.shipment.invalidate(), utils.report.invalidate()]);
    toast.success(`Totals corrected: ${result.deliveredQty} delivered, ${result.remainingQty} outstanding. Do not re-enter this delivery again.`);
  } });
  if (partialQuantityBlockReason(shipment) || !(shipment.deliveredQty || shipment.status === "partially_delivered")) return null;
  const delivered = Number(quantity), total = snapshot?.actualItemCount ?? 0;
  const valid = quantity !== "" && Number.isInteger(delivered) && delivered >= 0 && delivered < total;
  return <>
    <Button variant="outline" size="sm" onClick={() => { correction.reset(); setQuantity(""); setReason(""); setConfirmed(false); setSnapshot({ ...shipment }); }}>Correct partial-delivery total</Button>
    <Dialog open={snapshot !== null} onOpenChange={open => { if (!open && !correction.isPending) setSnapshot(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Correct partial-delivery total</DialogTitle><DialogDescription>Repair stale totals after a partial-delivery entry was deleted for {snapshot?.trackingId || "this shipment"}.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={e => {
          e.preventDefault(); if (!snapshot || !valid || !confirmed || correction.isPending) return;
          correction.mutate({ shipmentId: snapshot.id, expectedDeliveredQty: snapshot.deliveredQty, expectedRemainingQty: snapshot.remainingQty, expectedStatus: snapshot.status, expectedTotal: snapshot.actualItemCount!, deliveredQty: delivered, reason: reason.trim() });
        }}>
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950 space-y-1"><p>Total shipment: <strong>{total} items</strong></p><p>Currently recorded: <strong>{snapshot?.deliveredQty ?? 0} delivered, {snapshot?.remainingQty ?? "unknown"} outstanding</strong></p></div>
          <div className="space-y-2"><Label htmlFor="correct-delivered-total">Actual total delivered so far</Label><Input id="correct-delivered-total" type="number" min={0} max={Math.max(0, total - 1)} step={1} required disabled={correction.isPending} value={quantity} onChange={e => setQuantity(e.target.value)} /><p className="text-xs text-ink-soft">Enter the cumulative total, not an additional delivery. For all items delivered, use normal full-delivery confirmation.</p></div>
          {valid && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-950" role="status">After correction: <strong>{delivered} delivered · {total - delivered} outstanding</strong></p>}
          <div className="space-y-2"><Label htmlFor="quantity-correction-reason">Reason and verified quantities</Label><Textarea id="quantity-correction-reason" required minLength={10} maxLength={1000} disabled={correction.isPending} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the deleted mistake, any re-entry, and the quantity physically delivered." /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required disabled={correction.isPending} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>I verified the actual total delivered. This is a correction, not another delivery.</span></label>
          <p className="text-xs text-ink-soft">Valid delivery entries, driver history and dates are kept. A deleted partial-entry audit record is required. No push notification is sent.</p>
          {correction.error && <p role="alert" className="text-sm text-red-700">{correction.error.message}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={correction.isPending} onClick={() => setSnapshot(null)}>Cancel</Button><Button className="bg-navy" type="submit" disabled={!valid || !confirmed || reason.trim().length < 10 || correction.isPending}>{correction.isPending ? "Correcting…" : "Save corrected total"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
