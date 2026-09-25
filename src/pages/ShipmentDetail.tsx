import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { STATUS_LABELS, STATUS_COLORS, RECEIVABLE_BY_BRANCH_STATUSES } from "@contracts/constants";
import { ArrowLeft, MapPin, User, Phone, Truck, QrCode, Trash2, AlertTriangle, CheckCircle2, Building2, Check } from "lucide-react";
import { toast } from "sonner";

// <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const utils = trpc.useUtils();

  const { data: shipment, isLoading } = trpc.shipment.getById.useQuery({ id: Number(id) });

  const canWarehouse = role && ["super_admin", "admin", "warehouse_supply"].includes(role);
  const canLogistics = role && ["super_admin", "admin", "logistics_officer"].includes(role);
  const isDriverAssigned = shipment?.assignedDriverId === user?.id;
  const isSuperAdmin = role === "super_admin";
  const canAcknowledge = role && (
    ["super_admin", "admin"].includes(role) ||
    (role === "branch_manager" && shipment?.destBranchId === user?.branchId)
  );

  const [showDeleteShipment, setShowDeleteShipment] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const deleteShipmentMutation = trpc.shipment.deleteShipment.useMutation({
    onSuccess: () => {
      toast.success("Shipment deleted");
      utils.shipment.list.invalidate();
      navigate("/shipments");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteEventMutation = trpc.shipment.deleteTrackingEvent.useMutation({
    onSuccess: () => {
      toast.success("Event deleted");
      utils.shipment.getById.invalidate({ id: Number(id) });
    },
    onError: (err) => toast.error(err.message),
  });

  const acknowledgeDeliveryMutation = trpc.shipment.acknowledgeDelivery.useMutation({
    onSuccess: () => {
      toast.success("Delivery acknowledged");
      utils.shipment.getById.invalidate({ id: Number(id) });
      utils.shipment.list.invalidate();
      utils.shipment.attentionStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDeleteEvent = (eventId: number) => {
    if (!confirm("Permanently delete this tracking event? This cannot be undone.")) return;
    deleteEventMutation.mutate({ eventId });
  };

  // ── Hub route + branch fallback ──
  // Only the responsible branch manager gets these (no admin override): the
  // person on record is the one who actually received or sent the shipment.
  const isHubRoute = !!shipment?.hubBranchId;
  const isHubManager = role === "branch_manager" && !!shipment?.hubBranchId && shipment.hubBranchId === user?.branchId;
  const receivingBranchId = shipment ? (shipment.hubBranchId ?? shipment.destBranchId) : null;
  const canMarkReceived = role === "branch_manager" && !!shipment && receivingBranchId === user?.branchId &&
    (RECEIVABLE_BY_BRANCH_STATUSES as readonly string[]).includes(shipment.status);

  const refreshShipment = () => {
    utils.shipment.getById.invalidate({ id: Number(id) });
    utils.shipment.list.invalidate();
    utils.shipment.attentionStats.invalidate();
    utils.shipment.recentActivity.invalidate();
  };

  const acknowledgeAtHubMutation = trpc.shipment.acknowledgeAtHub.useMutation({
    onSuccess: () => { toast.success("Receipt at hub acknowledged"); refreshShipment(); },
    onError: (err) => toast.error(err.message),
  });

  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchVehicle, setDispatchVehicle] = useState("");
  const [dispatchWaybill, setDispatchWaybill] = useState("");
  const [dispatchExpected, setDispatchExpected] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const dispatchOnwardMutation = trpc.shipment.dispatchOnward.useMutation({
    onSuccess: () => {
      toast.success("Dispatched onward");
      setShowDispatch(false);
      setDispatchVehicle(""); setDispatchWaybill(""); setDispatchExpected(""); setDispatchNote("");
      refreshShipment();
    },
    onError: (err) => toast.error(err.message),
  });

  const [showReceived, setShowReceived] = useState(false);
  const [receivedAt, setReceivedAt] = useState("");
  const [receivedQty, setReceivedQty] = useState("");
  const [receivedNote, setReceivedNote] = useState("");
  const markReceivedMutation = trpc.shipment.markReceivedByBranch.useMutation({
    onSuccess: (result) => {
      toast.success(result.completed ? "Receipt recorded and shipment completed"
        : result.remaining > 0 ? `Partial receipt recorded, ${result.remaining} item(s) still to arrive`
        : "Receipt recorded");
      setShowReceived(false);
      setReceivedNote("");
      refreshShipment();
    },
    onError: (err) => toast.error(err.message),
  });
  const openReceivedDialog = () => {
    setReceivedAt(toLocalInputValue(new Date()));
    setReceivedQty(String(shipment?.actualItemCount ?? shipment?.estimatedItemCount ?? ""));
    setShowReceived(true);
  };

  if (isLoading) return <div className="p-4 text-center text-ink-soft">Loading...</div>;
  if (!shipment) return <div className="p-4 text-center text-ink-soft">Shipment not found</div>;

  const events = shipment.trackingEvents || [];
  return (
    <div className="max-w-lg mx-auto bg-ground min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-navy text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-sm font-bold font-display">{shipment.trackingId || `Shipment #${shipment.id}`}</h1>
        </div>
      </div>

      <div className="p-4">
        {/* Status badge */}
        <div className="flex flex-col items-center gap-1.5 mb-4">
          <Badge className={`text-xs px-3 py-1 rounded-full ${STATUS_COLORS[shipment.status] || ""}`}>
            {STATUS_LABELS[shipment.status] || shipment.status}
          </Badge>
          {shipment.deliveryOutcome === "on_time" && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1E7B4D]">
              <CheckCircle2 size={14} />
              On time{shipment.estimatedDeliveryDate && (shipment.deliveredAt || shipment.completedAt) && (
                <> &middot; {isHubRoute ? "reached hub" : "delivered"} {new Date((shipment.deliveredAt || shipment.completedAt)!).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}, ETA {new Date(shipment.estimatedDeliveryDate).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</>
              )}
            </div>
          )}
          {shipment.deliveryOutcome === "late" && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B3261E]">
              <AlertTriangle size={14} />
              Overdue by {shipment.daysLate} day{shipment.daysLate === 1 ? "" : "s"}{shipment.estimatedDeliveryDate && (shipment.deliveredAt || shipment.completedAt) && (
                <> &middot; {isHubRoute ? "reached hub" : "delivered"} {new Date((shipment.deliveredAt || shipment.completedAt)!).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}, ETA {new Date(shipment.estimatedDeliveryDate).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</>
              )}
            </div>
          )}
          {shipment.deliveryOutcome === "no_eta" && (
            <span className="text-xs font-medium text-ink-soft">No ETA was recorded for this shipment</span>
          )}
        </div>

        {/* Route */}
        <Card className="border border-[#E8E4DC] shadow-none rounded-2xl mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="w-8 h-8 bg-[#E7F3EC] rounded-full flex items-center justify-center mx-auto mb-1"><MapPin size={14} className="text-[#1E7B4D]" /></div>
                <p className="text-[11px] text-ink-soft">Origin</p>
                <p className="text-xs font-semibold text-ink">Lagos HQ</p>
              </div>
              <div className={`flex-1 mx-3 border-t-2 relative ${isHubRoute ? "border-[#1E7B4D]" : "border-dashed border-[#E8E4DC]"}`}><Truck size={16} className="absolute left-1/2 -translate-x-1/2 -top-3 text-ink-soft" /></div>
              {isHubRoute && (
                <>
                  <div className="text-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1 ${isHubManager ? "bg-navy" : "bg-navy-soft"}`}>
                      <Building2 size={14} className={isHubManager ? "text-white" : "text-navy"} />
                    </div>
                    <p className="text-[11px] text-navy font-semibold">{isHubManager ? "Hub · you" : "Hub"}</p>
                    <p className="text-xs font-semibold text-ink">{shipment.hubBranchName}</p>
                  </div>
                  <div className="flex-1 mx-3 border-t-2 border-dashed border-[#E8E4DC]" />
                </>
              )}
              <div className="text-center">
                <div className="w-8 h-8 bg-clay-soft rounded-full flex items-center justify-center mx-auto mb-1"><MapPin size={14} className="text-clay" /></div>
                <p className="text-[11px] text-ink-soft">Destination</p>
                <p className="text-xs font-semibold text-ink">{shipment.destinationBranch}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two acknowledgements (hub routes only) */}
        {isHubRoute && shipment.status !== "cancelled" && (
          <Card className="border border-[#E8E4DC] shadow-none rounded-2xl mb-4">
            <CardContent className="p-4">
              <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-3">Two acknowledgements</h3>
              {[
                {
                  n: 1,
                  title: `Hub receipt · ${shipment.hubBranchName}`,
                  done: !!shipment.hubAcknowledgedAt,
                  text: shipment.hubAcknowledgedAt
                    ? `Acknowledged ${new Date(shipment.hubAcknowledgedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                    : shipment.status === "at_hub" ? `Waiting for ${shipment.hubBranchName}` : "After the 3PL reaches the hub",
                  waiting: shipment.status === "at_hub" && !shipment.hubAcknowledgedAt,
                },
                {
                  n: 2,
                  title: `Branch receipt · ${shipment.destinationBranch}`,
                  done: shipment.status === "completed",
                  text: shipment.status === "completed"
                    ? `Acknowledged ${shipment.completedAt ? new Date(shipment.completedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""}`
                    : shipment.status === "onward_in_transit" ? `Waiting for ${shipment.destinationBranch}` : "After onward delivery",
                  waiting: shipment.status === "onward_in_transit",
                },
              ].map(step => (
                <div key={step.n} className="flex gap-3 items-start mb-3 last:mb-0">
                  <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                    step.done ? "bg-[#1E7B4D] text-white" : step.waiting ? "border-2 border-clay text-clay" : "border-2 border-[#E8E4DC] text-[#A7ADB8]"}`}>
                    {step.done ? <Check size={12} strokeWidth={3.5} /> : step.n}
                  </div>
                  <div>
                    <p className={`text-[13px] font-semibold ${step.done || step.waiting ? "text-ink" : "text-ink-soft"}`}>{step.title}</p>
                    <p className={`text-xs ${step.done ? "text-[#1E7B4D]" : step.waiting ? "text-clay font-semibold" : "text-ink-soft/70"}`}>{step.text}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Onward delivery details, once the hub has sent it on */}
        {shipment.onwardDispatchedAt && (() => {
          const onward = (shipment.onwardDetails || {}) as { vehicle?: string; waybill?: string | null; expectedDate?: string | null; note?: string | null };
          return (
            <Card className="border border-[#E8E4DC] shadow-none rounded-2xl mb-4">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide">Onward delivery from {shipment.hubBranchName}</h3>
                <div className="flex justify-between text-[12.5px]"><span className="text-ink-soft">Dispatched</span><strong className="text-ink">{new Date(shipment.onwardDispatchedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</strong></div>
                {onward.vehicle && <div className="flex justify-between text-[12.5px]"><span className="text-ink-soft">Vehicle / driver</span><strong className="text-ink">{onward.vehicle}</strong></div>}
                {onward.waybill && <div className="flex justify-between text-[12.5px]"><span className="text-ink-soft">Waybill</span><strong className="text-ink">{onward.waybill}</strong></div>}
                {onward.expectedDate && <div className="flex justify-between text-[12.5px]"><span className="text-ink-soft">Expected at {shipment.destinationBranch}</span><strong className="text-ink">{new Date(onward.expectedDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</strong></div>}
                {onward.note && <p className="text-xs text-ink-soft">{onward.note}</p>}
              </CardContent>
            </Card>
          );
        })()}

        {/* Details */}
        <Card className="border border-[#E8E4DC] shadow-none rounded-2xl mb-4">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide">Shipment Details</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#F3F1EC] rounded-xl p-2"><p className="text-lg font-bold font-display text-ink">{shipment.actualItemCount || shipment.estimatedItemCount || 0}</p><p className="text-[10px] text-ink-soft">Items</p></div>
              {shipment.weightKg && (
                <div className="bg-navy-soft rounded-xl p-2"><p className="text-lg font-bold font-display text-navy">{shipment.weightKg}</p><p className="text-[10px] text-navy/70">Weight (kg)</p></div>
              )}
              <div className="bg-[#F3F1EC] rounded-xl p-2"><p className="text-lg font-bold font-display text-ink">{shipment.deliveredQty || 0}</p><p className="text-[10px] text-ink-soft">Delivered</p></div>
              <div className="bg-[#F3F1EC] rounded-xl p-2"><p className="text-lg font-bold font-display text-ink">{shipment.remainingQty || 0}</p><p className="text-[10px] text-ink-soft">Remaining</p></div>
            </div>
            {shipment.receiverName && (
              <div className="flex items-center gap-2 text-sm text-ink"><User size={14} className="text-ink-soft" /><span>{shipment.receiverName}</span></div>
            )}
            {shipment.receiverPhone && (
              <div className="flex items-center gap-2 text-sm text-ink"><Phone size={14} className="text-ink-soft" /><span>{shipment.receiverPhone}</span></div>
            )}
            {shipment.storageLocation && (
              <div className="flex items-center gap-2 text-sm text-ink"><MapPin size={14} className="text-ink-soft" /><span>{shipment.storageLocation}</span></div>
            )}
            {shipment.itemDetails && (
              <div className="bg-clay-soft rounded-xl p-2 text-xs text-[#8A5A15]"><strong>Items:</strong> {shipment.itemDetails}</div>
            )}
            {shipment.description && (
              <div className="text-xs text-ink-soft">{shipment.description}</div>
            )}
          </CardContent>
        </Card>

        {/* 3PL Info */}
        {shipment.tplName && (
          <Card className="border border-[#E8E4DC] shadow-none rounded-2xl mb-4">
            <CardContent className="p-4">
              <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-2">3PL Information</h3>
              <p className="text-sm font-semibold text-ink">{shipment.tplName}</p>
              <p className="text-xs text-ink-soft">Pickup: {shipment.tplPickupType === "kedi_driver_drop" ? "KEDI Driver Drop-off" : "3PL Direct Pickup"}</p>
              {shipment.driverName && <p className="text-xs text-ink-soft mt-1">Driver: {shipment.driverName}</p>}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mb-4">
          {shipment.status === "created" && canWarehouse && (
            <Button className="w-full bg-navy hover:bg-[#0F2039] h-12 rounded-xl font-semibold" onClick={() => navigate(`/warehouse/${shipment.id}`)}>
              <QrCode size={16} className="mr-2" /> Process & Generate Label
            </Button>
          )}
          {shipment.status === "labeled" && canLogistics && (
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 rounded-xl font-semibold" onClick={() => navigate(`/assign-3pl/${shipment.id}`)}>
              <Truck size={16} className="mr-2" /> Assign to 3PL
            </Button>
          )}
          {isDriverAssigned && shipment.status === "waiting_driver_pickup" && (
            <Button className="w-full bg-[#1E7B4D] hover:bg-[#155C39] h-12 rounded-xl font-semibold" onClick={() => navigate(`/scan?action=pickup&shipmentId=${shipment.id}`)}>
              <QrCode size={16} className="mr-2" /> Scan to Pickup
            </Button>
          )}
          {shipment.status === "picked_up" && isDriverAssigned && (
            <Button className="w-full bg-navy hover:bg-[#0F2039] h-12 rounded-xl font-semibold" onClick={() => navigate(`/scan?action=dropoff&shipmentId=${shipment.id}`)}>
              <MapPin size={16} className="mr-2" /> Scan at 3PL Drop-off
            </Button>
          )}
          {/* Direct route: delivered. Hub route: the hub has sent it on. */}
          {((shipment.status === "delivered" && !isHubRoute) || shipment.status === "onward_in_transit") && canAcknowledge && (
            <Button
              className="w-full bg-[#1E7B4D] hover:bg-[#155C39] h-12 rounded-xl font-semibold"
              disabled={acknowledgeDeliveryMutation.isPending}
              onClick={() => acknowledgeDeliveryMutation.mutate({ shipmentId: shipment.id })}
            >
              <CheckCircle2 size={16} className="mr-2" />
              {acknowledgeDeliveryMutation.isPending ? "Acknowledging..." : "Acknowledge Receipt"}
            </Button>
          )}
          {/* The hub never recorded sending it on, but it has reached the final branch. */}
          {shipment.status === "at_hub" && isHubRoute && canAcknowledge && !isHubManager && (
            <Button
              variant="outline"
              className="w-full h-10 rounded-xl font-semibold border-[#E8E4DC] text-ink hover:bg-white"
              disabled={acknowledgeDeliveryMutation.isPending}
              onClick={() => {
                if (!confirm(`${shipment.hubBranchName} hasn't recorded sending this on. Only acknowledge if it has actually reached your branch.`)) return;
                acknowledgeDeliveryMutation.mutate({ shipmentId: shipment.id });
              }}
            >
              <CheckCircle2 size={14} className="mr-2" /> It arrived, but the hub didn't record dispatch
            </Button>
          )}
          {/* Hub manager: acknowledgement #1, then send it on */}
          {shipment.status === "at_hub" && isHubManager && !shipment.hubAcknowledgedAt && (
            <Button
              className="w-full bg-navy hover:bg-[#0F2039] h-12 rounded-xl font-semibold"
              disabled={acknowledgeAtHubMutation.isPending}
              onClick={() => acknowledgeAtHubMutation.mutate({ shipmentId: shipment.id })}
            >
              <Check size={16} className="mr-2" />
              {acknowledgeAtHubMutation.isPending ? "Acknowledging..." : "Acknowledge receipt at hub"}
            </Button>
          )}
          {shipment.status === "at_hub" && isHubManager && shipment.hubAcknowledgedAt && (
            <Button className="w-full bg-navy hover:bg-[#0F2039] h-12 rounded-xl font-semibold" onClick={() => setShowDispatch(true)}>
              <Truck size={16} className="mr-2" /> Dispatch onward to {shipment.destinationBranch}
            </Button>
          )}
          {/* The 3PL never posted a delivery update but the shipment has arrived */}
          {canMarkReceived && (
            <Button variant="outline" className="w-full h-10 rounded-xl font-semibold border-[#E8E4DC] text-ink hover:bg-white" onClick={openReceivedDialog}>
              <Check size={14} className="mr-2" /> Mark as received (3PL hasn't updated)
            </Button>
          )}
          {shipment.qrCodeToken && (
            <Button variant="outline" className="w-full h-10 rounded-xl font-semibold border-[#E8E4DC] text-ink hover:bg-white" onClick={() => navigate("/scan")}>
              <QrCode size={14} className="mr-2" /> Scan QR Code
            </Button>
          )}
        </div>

        {/* Timeline */}
        <Card className="border border-[#E8E4DC] shadow-none rounded-2xl mb-4">
          <CardContent className="p-4">
            <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-3">Tracking History</h3>
            <div className="space-y-0">
              {events.map((event, i) => (
                <div key={event.id} className="flex gap-3 relative">
                  {i < events.length - 1 && <div className="absolute left-[7px] top-6 w-0.5 h-full bg-[#E8E4DC]" />}
                  <div className={`w-4 h-4 rounded-full mt-1 flex-shrink-0 ${i === events.length - 1 ? "bg-navy" : "bg-[#D8D4CC]"}`} />
                  <div className="pb-4 flex-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold text-clay">{event.actorName || "Unknown"}</p>
                      <p className="text-xs font-medium text-ink">{event.notes || event.eventType}</p>
                      <p className="text-[10px] text-ink-soft/70">
                        {event.createdAt ? (
                          <>
                            {new Date(event.createdAt).toLocaleString()}
                            {event.estimatedTime && <span className="text-[#B7791F] font-medium"> (approx.)</span>}
                          </>
                        ) : "Unknown time"}
                      </p>
                    </div>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        disabled={deleteEventMutation.isPending}
                        className="p-1 text-ink-soft/40 hover:text-[#B3261E] transition-colors flex-shrink-0"
                        aria-label="Delete event"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {events.length === 0 && <p className="text-xs text-ink-soft">No tracking events yet</p>}
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone — Super Admin only */}
        {isSuperAdmin && (
          <Card className="border border-[#F0CAC8] shadow-none rounded-2xl mb-4">
            <CardContent className="p-4">
              <h3 className="text-[11px] font-bold text-[#B3261E] uppercase tracking-wide mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> Danger Zone
              </h3>
              <p className="text-xs text-ink-soft mb-3">Permanently delete this shipment and its entire tracking history. This cannot be undone.</p>
              <Button
                variant="outline"
                className="w-full text-[#B3261E] border-[#F0CAC8] hover:bg-[#FBEAE9] rounded-xl font-semibold"
                onClick={() => setShowDeleteShipment(true)}
              >
                <Trash2 size={14} className="mr-2" /> Delete Shipment Permanently
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dispatch onward (hub manager) */}
      <Dialog open={showDispatch} onOpenChange={setShowDispatch}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dispatch onward to {shipment.destinationBranch}</DialogTitle></DialogHeader>
          <p className="text-xs text-ink-soft -mt-1">{shipment.destinationBranch} is notified as soon as you confirm.</p>
          <div className="space-y-3">
            <div><Label htmlFor="dispatch-vehicle">Vehicle or driver *</Label><Input id="dispatch-vehicle" value={dispatchVehicle} onChange={e => setDispatchVehicle(e.target.value)} placeholder="e.g. Kehinde, Toyota Hiace" /></div>
            <div className="flex gap-2">
              <div className="flex-1"><Label htmlFor="dispatch-waybill">Waybill no.</Label><Input id="dispatch-waybill" value={dispatchWaybill} onChange={e => setDispatchWaybill(e.target.value)} /></div>
              <div className="flex-1"><Label htmlFor="dispatch-expected">Expected at {shipment.destinationBranch}</Label><Input id="dispatch-expected" type="date" value={dispatchExpected} onChange={e => setDispatchExpected(e.target.value)} /></div>
            </div>
            <div><Label htmlFor="dispatch-note">Note (optional)</Label><Textarea id="dispatch-note" value={dispatchNote} onChange={e => setDispatchNote(e.target.value)} rows={2} /></div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowDispatch(false)}>Cancel</Button>
              <Button
                className="flex-[2] bg-navy hover:bg-[#0F2039]"
                disabled={!dispatchVehicle.trim() || dispatchOnwardMutation.isPending}
                onClick={() => dispatchOnwardMutation.mutate({
                  shipmentId: shipment.id,
                  vehicle: dispatchVehicle.trim(),
                  waybill: dispatchWaybill.trim() || undefined,
                  expectedDate: dispatchExpected || undefined,
                  note: dispatchNote.trim() || undefined,
                })}
              >
                {dispatchOnwardMutation.isPending ? "Dispatching..." : "Dispatch onward"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark as received (branch manager, 3PL never updated) */}
      <Dialog open={showReceived} onOpenChange={setShowReceived}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark as received</DialogTitle></DialogHeader>
          <p className="text-xs text-ink-soft -mt-1">
            {shipment.tplName || "The 3PL"} hasn't posted a delivery update. Record what actually arrived{isHubRoute ? ` at ${shipment.hubBranchName}` : ` at ${shipment.destinationBranch}`}.
          </p>
          {(() => {
            const expected = shipment.actualItemCount ?? shipment.estimatedItemCount ?? null;
            const qty = Number(receivedQty);
            const short = expected != null && qty > 0 && qty < expected;
            return (
              <div className="space-y-3">
                <div><Label htmlFor="received-at">Time received</Label><Input id="received-at" type="datetime-local" value={receivedAt} max={toLocalInputValue(new Date())} onChange={e => setReceivedAt(e.target.value)} /></div>
                <div>
                  <Label htmlFor="received-qty">Total quantity received{expected != null ? ` (expected ${expected})` : ""}</Label>
                  <Input id="received-qty" type="number" min={1} value={receivedQty} onChange={e => setReceivedQty(e.target.value)} className={short ? "border-[#B7791F]" : ""} />
                  {short && (
                    <p className="mt-2 rounded-lg bg-clay-soft p-2 text-[11.5px] text-[#8A5A15]">
                      {expected! - qty} fewer than expected. This will be recorded as a partial delivery, not completed, so the remaining {expected! - qty} stay tracked.
                    </p>
                  )}
                </div>
                <div><Label htmlFor="received-note">Note</Label><Textarea id="received-note" value={receivedNote} onChange={e => setReceivedNote(e.target.value)} rows={2} /></div>
                <p className="text-[11px] text-ink-soft">KEDI operations will be told the 3PL didn't update this shipment.</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setShowReceived(false)}>Cancel</Button>
                  <Button
                    className="flex-[2] bg-navy hover:bg-[#0F2039]"
                    disabled={!receivedAt || !(qty >= 1) || markReceivedMutation.isPending}
                    onClick={() => markReceivedMutation.mutate({
                      shipmentId: shipment.id,
                      receivedAt: new Date(receivedAt).toISOString(),
                      receivedQty: qty,
                      note: receivedNote.trim() || undefined,
                    })}
                  >
                    {markReceivedMutation.isPending ? "Saving..." : `Record ${qty >= 1 ? qty : ""} received`}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteShipment} onOpenChange={(open) => { setShowDeleteShipment(open); if (!open) setDeleteReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {shipment.trackingId || `shipment #${shipment.id}`}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the shipment and its full tracking history from the database. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="delete-reason">Reason *</Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              placeholder="Why is this shipment being deleted?"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteReason.trim().length < 3 || deleteShipmentMutation.isPending}
              onClick={() => deleteShipmentMutation.mutate({ shipmentId: shipment.id, reason: deleteReason.trim() })}
            >
              {deleteShipmentMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
