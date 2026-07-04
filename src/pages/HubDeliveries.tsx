import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { toast } from "sonner";
import { Package, ArrowRight, CheckCircle, Truck } from "lucide-react";

export default function HubDeliveries() {
  const [ackDialog, setAckDialog] = useState<{ id: number; trackingId: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState<{ id: number; trackingId: string } | null>(null);
  const [ackForm, setAckForm] = useState({ receivedQty: "", condition: "good" as "good" | "partial" | "damaged", notes: "" });
  const [transferForm, setTransferForm] = useState({ vehiclePlate: "", driverName: "", driverPhone: "", estimatedArrival: "", notes: "" });

  const utils = trpc.useUtils();
  const { data: hubData, isLoading } = trpc.shipment.listHubDeliveries.useQuery({ status: "all" });
  const { data: incomingData } = trpc.shipment.listIncomingTransfers.useQuery();

  const ackMutation = trpc.shipment.hubAcknowledge.useMutation({
    onSuccess: () => {
      utils.shipment.listHubDeliveries.invalidate();
      setAckDialog(null);
      setAckForm({ receivedQty: "", condition: "good", notes: "" });
      toast.success("Shipment acknowledged at hub");
    },
    onError: (err) => toast.error(err.message),
  });

  const transferMutation = trpc.shipment.initiateOnwardTransfer.useMutation({
    onSuccess: () => {
      utils.shipment.listHubDeliveries.invalidate();
      utils.shipment.listIncomingTransfers.invalidate();
      setTransferDialog(null);
      setTransferForm({ vehiclePlate: "", driverName: "", driverPhone: "", estimatedArrival: "", notes: "" });
      toast.success("Onward transfer initiated");
    },
    onError: (err) => toast.error(err.message),
  });

  const pending = hubData?.shipments?.filter((s: any) => s.status === "delivered_to_hub") || [];
  const readyToTransfer = hubData?.shipments?.filter((s: any) => s.status === "at_hub_pending_transfer") || [];
  const incoming = incomingData?.shipments || [];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-bold text-[#1E293B]">Hub Deliveries</h1>

      {/* Incoming Transfers Section */}
      {incoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-cyan-700 mb-2 flex items-center gap-1">
            <Truck size={14} /> Incoming to Your Branch ({incoming.length})
          </h2>
          <div className="space-y-2">
            {incoming.map((s: any) => (
              <Card key={s.id} className="border-cyan-200 bg-cyan-50">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{s.trackingId || `#${s.id}`}</p>
                      <p className="text-xs text-gray-600">From {s.hubBranchName} → {s.destinationBranch}</p>
                      <p className="text-xs text-gray-500">{s.receiverName} | {s.actualItemCount} items</p>
                      {s.onwardTransferLog && (
                        <div className="mt-1 text-xs text-gray-600 bg-white p-1.5 rounded">
                          <p><strong>Vehicle:</strong> {(s.onwardTransferLog as any).vehiclePlate}</p>
                          <p><strong>Driver:</strong> {(s.onwardTransferLog as any).driverName} ({(s.onwardTransferLog as any).driverPhone})</p>
                          {(s.onwardTransferLog as any).estimatedArrival && <p><strong>ETA:</strong> {(s.onwardTransferLog as any).estimatedArrival}</p>}
                        </div>
                      )}
                    </div>
                    <Badge className="text-[9px] bg-cyan-100 text-cyan-700">{STATUS_LABELS[s.status] || s.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pending Acknowledgement */}
      <div>
        <h2 className="text-sm font-semibold text-violet-700 mb-2 flex items-center gap-1">
          <Package size={14} /> Arrived at Hub - Acknowledge ({pending.length})
        </h2>
        {pending.length === 0 && !isLoading && <p className="text-sm text-gray-400 py-4 text-center">No shipments waiting for acknowledgement</p>}
        <div className="space-y-2">
          {pending.map((s: any) => (
            <Card key={s.id} className="border-violet-200 bg-violet-50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{s.trackingId || `#${s.id}`}</p>
                    <p className="text-xs text-gray-600">For: {s.destinationBranch}</p>
                    <p className="text-xs text-gray-500">{s.receiverName} | {s.deliveredQty} items delivered</p>
                  </div>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 h-8 text-xs" onClick={() => setAckDialog({ id: s.id, trackingId: s.trackingId || `#${s.id}` })}>
                    <CheckCircle size={12} className="mr-1" /> Acknowledge
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Ready for Onward Transfer */}
      <div>
        <h2 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
          <ArrowRight size={14} /> Ready for Onward Transfer ({readyToTransfer.length})
        </h2>
        {readyToTransfer.length === 0 && !isLoading && <p className="text-sm text-gray-400 py-4 text-center">No shipments ready for transfer</p>}
        <div className="space-y-2">
          {readyToTransfer.map((s: any) => (
            <Card key={s.id} className="border-amber-200 bg-amber-50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{s.trackingId || `#${s.id}`}</p>
                    <p className="text-xs text-gray-600">For: {s.destinationBranch}</p>
                    <p className="text-xs text-gray-500">{s.actualItemCount} items | Acknowledged: {s.branchAcknowledgedQty}</p>
                  </div>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-8 text-xs" onClick={() => setTransferDialog({ id: s.id, trackingId: s.trackingId || `#${s.id}` })}>
                    <Truck size={12} className="mr-1" /> Transfer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Acknowledge Dialog */}
      {ackDialog && (
        <Dialog open={!!ackDialog} onOpenChange={() => setAckDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Acknowledge at Hub - {ackDialog.trackingId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Received Quantity</Label><Input type="number" value={ackForm.receivedQty} onChange={e => setAckForm({ ...ackForm, receivedQty: e.target.value })} placeholder="Enter quantity received" /></div>
              <div><Label>Condition</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={ackForm.condition} onChange={e => setAckForm({ ...ackForm, condition: e.target.value as any })}>
                  <option value="good">Good - All items perfect</option>
                  <option value="partial">Partial - Some issues</option>
                  <option value="damaged">Damaged - Significant damage</option>
                </select>
              </div>
              <div><Label>Notes</Label><Input value={ackForm.notes} onChange={e => setAckForm({ ...ackForm, notes: e.target.value })} placeholder="Any observations..." /></div>
              <Button className="w-full bg-violet-600" disabled={!ackForm.receivedQty || ackMutation.isPending} onClick={() => ackMutation.mutate({
                shipmentId: ackDialog.id,
                receivedQty: Number(ackForm.receivedQty),
                condition: ackForm.condition,
                notes: ackForm.notes,
              })}>
                {ackMutation.isPending ? "Acknowledging..." : "Confirm Acknowledgement"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Onward Transfer Dialog */}
      {transferDialog && (
        <Dialog open={!!transferDialog} onOpenChange={() => setTransferDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Initiate Onward Transfer - {transferDialog.trackingId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 bg-amber-50 p-2 rounded">Enter the hired vehicle details for delivery to the final branch.</p>
              <div><Label>Vehicle Plate Number *</Label><Input value={transferForm.vehiclePlate} onChange={e => setTransferForm({ ...transferForm, vehiclePlate: e.target.value })} placeholder="e.g. ABC-123XY" /></div>
              <div><Label>Driver Name *</Label><Input value={transferForm.driverName} onChange={e => setTransferForm({ ...transferForm, driverName: e.target.value })} placeholder="Driver full name" /></div>
              <div><Label>Driver Phone *</Label><Input value={transferForm.driverPhone} onChange={e => setTransferForm({ ...transferForm, driverPhone: e.target.value })} placeholder="08012345678" /></div>
              <div><Label>Estimated Arrival</Label><Input type="datetime-local" value={transferForm.estimatedArrival} onChange={e => setTransferForm({ ...transferForm, estimatedArrival: e.target.value })} /></div>
              <div><Label>Notes</Label><Input value={transferForm.notes} onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="Any special instructions..." /></div>
              <Button className="w-full bg-amber-600" disabled={!transferForm.vehiclePlate || !transferForm.driverName || !transferForm.driverPhone || transferMutation.isPending} onClick={() => transferMutation.mutate({
                shipmentId: transferDialog.id,
                vehiclePlate: transferForm.vehiclePlate,
                driverName: transferForm.driverName,
                driverPhone: transferForm.driverPhone,
                estimatedArrival: transferForm.estimatedArrival || undefined,
                notes: transferForm.notes,
              })}>
                {transferMutation.isPending ? "Initiating..." : "Confirm Transfer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
