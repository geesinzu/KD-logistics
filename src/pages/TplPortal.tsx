import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { Truck, LogOut, MapPin, Package, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";

export default function TplPortal() {
  const [filter, setFilter] = useState("all");
  const [selectedShipment, setSelectedShipment] = useState<any>(null);
  const [actionType, setActionType] = useState<"confirm" | "update" | "pickup" | null>(null);
  const [updateType, setUpdateType] = useState("");
  const [location, setLocation] = useState("");
  const [deliveredQty, setDeliveredQty] = useState("");
  const [receivedQty, setReceivedQty] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [newDeliveryDate, setNewDeliveryDate] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: me } = trpc.tpl.me.useQuery();
  const { data: shipmentsData, isLoading } = trpc.shipment.listForTpl.useQuery({ page: 1, limit: 50, status: filter === "all" ? undefined : filter === "active" ? undefined : filter });

  const { data: trackingHistory } = trpc.shipment.getTrackingHistory.useQuery(
    { shipmentId: expandedId! },
    { enabled: !!expandedId }
  );

  const confirmMutation = trpc.shipment.tplConfirmReceipt.useMutation({
    onSuccess: () => { utils.shipment.listForTpl.invalidate(); closeDialog(); },
    onError: (err) => alert("Error: " + err.message),
  });
  const pickupMutation = trpc.shipment.tplPickupFromWarehouse.useMutation({
    onSuccess: () => { utils.shipment.listForTpl.invalidate(); closeDialog(); },
    onError: (err) => alert("Error: " + err.message),
  });
  const updateMutation = trpc.shipment.tplUpdateLocation.useMutation({
    onSuccess: () => { utils.shipment.listForTpl.invalidate(); closeDialog(); },
    onError: (err) => alert("Error: " + err.message),
  });
  const updateDeliveryDateMutation = trpc.shipment.tplUpdateDeliveryDate.useMutation({
    onSuccess: () => { utils.shipment.listForTpl.invalidate(); },
  });

  const closeDialog = () => {
    setSelectedShipment(null);
    setActionType(null);
    setUpdateType(""); setLocation(""); setDeliveredQty(""); setReceivedQty(""); setCondition("good"); setNotes(""); setNewDeliveryDate("");
  };

  const handleConfirm = () => {
    if (!selectedShipment || !receivedQty) return;
    confirmMutation.mutate({
      shipmentId: selectedShipment.id,
      receivedQty: Number(receivedQty),
      condition: condition as "good" | "partial" | "damaged",
      notes: notes || undefined,
    });
  };

  const handleUpdate = () => {
    if (!selectedShipment || !updateType || !location) return;
    // If reporting delay with a new delivery date, update that first
    if (updateType === "delay_reported" && newDeliveryDate) {
      updateDeliveryDateMutation.mutate({
        shipmentId: selectedShipment.id,
        estimatedDeliveryDate: newDeliveryDate,
        notes: notes || undefined,
      });
    }
    updateMutation.mutate({
      shipmentId: selectedShipment.id,
      location,
      updateType: updateType as any,
      deliveredQty: deliveredQty ? Number(deliveredQty) : undefined,
      notes: notes || undefined,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("kedi_token");
    localStorage.removeItem("kedi_tpl_id");
    window.location.href = "/tpl-login";
  };

  const myShipments = shipmentsData?.shipments || [];

  const activeStatuses = ["assigned_to_3pl", "waiting_driver_pickup", "picked_up", "at_3pl", "waiting_3pl_pickup", "picked_up_by_3pl", "tpl_confirmed", "in_transit_with_3pl", "partially_delivered"];
  const doneStatuses = ["delivered", "completed"];

  const filtered = myShipments.filter((s: any) => {
    // Needs Action: shipments requiring 3PL to do something (confirm receipt OR pickup)
    if (filter === "needs_action") return ["at_3pl", "picked_up_by_3pl", "waiting_3pl_pickup"].includes(s.status);
    // In Transit: active shipments NOT needing immediate action
    if (filter === "active") return activeStatuses.includes(s.status) && !["at_3pl", "picked_up_by_3pl", "waiting_3pl_pickup"].includes(s.status);
    if (filter === "done") return doneStatuses.includes(s.status);
    return true;
  });

  // What action button to show per status
  function getActionLabel(status: string): string | null {
    if (["waiting_3pl_pickup"].includes(status)) return "Pickup from Warehouse";
    if (["at_3pl", "picked_up_by_3pl"].includes(status)) return "Confirm Receipt";
    if (["tpl_confirmed", "in_transit_with_3pl", "partially_delivered"].includes(status)) return "Update Status";
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-[#0F172A] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck size={20} className="text-indigo-400" />
          <div>
            <h1 className="text-sm font-bold">3PL Portal</h1>
            <p className="text-[10px] text-white/60">{me?.tplName || "Loading..."}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="p-1.5 text-white/70 hover:text-white"><LogOut size={18} /></button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><Package size={16} className="mx-auto mb-1 text-blue-600" /><p className="text-xl font-bold">{myShipments.length}</p><p className="text-[10px] text-gray-500">Total</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><Truck size={16} className="mx-auto mb-1 text-yellow-600" /><p className="text-xl font-bold">{myShipments.filter((s: any) => activeStatuses.includes(s.status)).length}</p><p className="text-[10px] text-gray-500">Active</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><CheckCircle2 size={16} className="mx-auto mb-1 text-green-600" /><p className="text-xl font-bold">{myShipments.filter((s: any) => doneStatuses.includes(s.status)).length}</p><p className="text-[10px] text-gray-500">Done</p></CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-3 overflow-x-auto">
          {[
            { key: "all", label: "All" },
            { key: "needs_action", label: "Needs Receipt", color: "bg-red-600" },
            { key: "active", label: "In Transit" },
            { key: "done", label: "Completed" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filter === f.key ? (f.color || "bg-indigo-600 text-white") : "bg-gray-100 text-gray-600"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Shipments */}
        {isLoading && <p className="text-center py-4 text-gray-400">Loading...</p>}
        {filtered.length === 0 && <p className="text-center py-8 text-gray-400">No shipments found</p>}
        <div className="space-y-2">
          {filtered.map((s: any) => {
            const needsReceipt = ["at_3pl", "picked_up_by_3pl"].includes(s.status);
            const needsPickup = s.status === "waiting_3pl_pickup";
            const actionLabel = getActionLabel(s.status);
            return (
              <Card key={s.id} className={`border-0 shadow-sm ${needsReceipt ? "ring-1 ring-red-200" : needsPickup ? "ring-1 ring-blue-200" : ""}`}>
                <CardContent className="p-3">
                  {/* Row 1: ID + Status */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-[#003B7A]">{s.trackingId || `#${s.id}`}</span>
                    <div className="flex items-center gap-1">
                      {needsReceipt && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">CONFIRM RECEIPT</span>}
                      {needsPickup && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">PICKUP REQUIRED</span>}
                      <Badge className={`text-[9px] ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                    </div>
                  </div>
                  {/* Row 2: Details */}
                  <p className="text-[11px] text-gray-500 mb-1">
                    To: {s.destinationBranch} | {s.actualItemCount || 0} items
                    {s.deliveredQty ? ` | Delivered: ${s.deliveredQty}` : ""}
                    {s.remainingQty ? ` | Remaining: ${s.remainingQty}` : ""}
                  </p>
                  {/* Row 2b: Estimated Delivery Date */}
                  {s.estimatedDeliveryDate && (
                    <p className="text-[11px] mb-1">
                      <span className="text-gray-400">Est. Delivery:</span>{" "}
                      <span className={`font-medium ${new Date(s.estimatedDeliveryDate) < new Date() && !doneStatuses.includes(s.status) ? "text-red-600" : "text-green-700"}`}>
                        {new Date(s.estimatedDeliveryDate).toLocaleDateString("en-NG", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                        {new Date(s.estimatedDeliveryDate) < new Date() && !doneStatuses.includes(s.status) ? " (OVERDUE)" : ""}
                      </span>
                    </p>
                  )}
                  {/* Row 3: Action + Expand */}
                  <div className="flex gap-2">
                    {actionLabel && (
                      <Button size="sm" className={`flex-1 h-8 text-xs ${
                        needsReceipt ? "bg-red-600 hover:bg-red-700" :
                        needsPickup ? "bg-blue-600 hover:bg-blue-700" :
                        "bg-indigo-600 hover:bg-indigo-700"
                      }`}
                        onClick={() => { setSelectedShipment(s); setActionType(needsReceipt ? "confirm" : needsPickup ? "pickup" : "update"); }}>
                        {needsReceipt ? <CheckCircle2 size={12} className="mr-1" /> :
                         needsPickup ? <Truck size={12} className="mr-1" /> :
                         <MapPin size={12} className="mr-1" />}
                        {actionLabel}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs px-2"
                      onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                      {expandedId === s.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      History
                    </Button>
                  </div>
                  {/* Expanded: Tracking History */}
                  {expandedId === s.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <h4 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Activity Log</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {trackingHistory?.length === 0 && <p className="text-xs text-gray-400">No activity yet</p>}
                        {trackingHistory?.map((e: any) => (
                          <div key={e.id} className="flex gap-2 text-xs">
                            <Clock size={10} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-gray-700">{e.notes}</p>
                              <p className="text-[10px] text-gray-400">
                                {e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}
                                {e.location ? ` @ ${e.location}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                        {!trackingHistory && <p className="text-xs text-gray-400">Loading...</p>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Pickup from Warehouse Dialog */}
      {selectedShipment && actionType === "pickup" && (
        <Dialog open={!!selectedShipment} onOpenChange={() => closeDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Pickup from Warehouse: {selectedShipment.trackingId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-blue-50 p-2 rounded text-xs text-blue-800">
                <strong>Pickup:</strong> {selectedShipment.actualItemCount || 0} items from Lagos HQ for delivery to {selectedShipment.destinationBranch}
              </div>
              <div>
                <Label>Quantity Picked Up *</Label>
                <Input type="number" value={receivedQty} onChange={e => setReceivedQty(e.target.value)} placeholder="How many items picked up?" />
              </div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any observations..." /></div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
                if (!selectedShipment || !receivedQty) return;
                pickupMutation.mutate({
                  shipmentId: selectedShipment.id,
                  receivedQty: Number(receivedQty),
                  notes: notes || `Picked up ${receivedQty} items from warehouse`,
                });
              }} disabled={pickupMutation.isPending || !receivedQty}>
                {pickupMutation.isPending ? "Confirming Pickup..." : "Confirm Pickup from Warehouse"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Receipt Dialog */}
      {selectedShipment && actionType === "confirm" && (
        <Dialog open={!!selectedShipment} onOpenChange={() => closeDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Confirm Receipt: {selectedShipment.trackingId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-800">
                <strong>Expected:</strong> {selectedShipment.actualItemCount || 0} items from Lagos HQ
              </div>
              <div>
                <Label>Quantity Received *</Label>
                <Input type="number" value={receivedQty} onChange={e => setReceivedQty(e.target.value)} placeholder="How many items received?" />
              </div>
              <div>
                <Label>Condition *</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">All Good</SelectItem>
                    <SelectItem value="partial">Partial/Missing</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any issues?" /></div>
              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleConfirm} disabled={confirmMutation.isPending || !receivedQty}>
                {confirmMutation.isPending ? "Confirming..." : "Confirm Receipt"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Update Status Dialog */}
      {selectedShipment && actionType === "update" && (
        <Dialog open={!!selectedShipment} onOpenChange={() => closeDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Update: {selectedShipment.trackingId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Update Type *</Label>
                <Select value={updateType} onValueChange={setUpdateType}>
                  <SelectTrigger><SelectValue placeholder="What happened?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="location_update">Location Update (In Transit)</SelectItem>
                    <SelectItem value="partial_delivery">Partial Delivery</SelectItem>
                    <SelectItem value="full_delivery">Full Delivery Complete</SelectItem>
                    <SelectItem value="delay_reported">Report Delay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Current Location *</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g., Benin Expressway" />
              </div>
              {updateType === "partial_delivery" && (
                <div>
                  <Label>Quantity Delivered Now</Label>
                  <Input type="number" value={deliveredQty} onChange={e => setDeliveredQty(e.target.value)} placeholder={`Of ${selectedShipment.actualItemCount || 0} total`} />
                </div>
              )}
              {updateType === "delay_reported" && (
                <div>
                  <Label>New Estimated Delivery Date</Label>
                  <Input
                    type="date"
                    value={newDeliveryDate}
                    onChange={e => setNewDeliveryDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Current: {selectedShipment.estimatedDeliveryDate ? new Date(selectedShipment.estimatedDeliveryDate).toLocaleDateString("en-NG") : "Not set"}
                  </p>
                </div>
              )}
              <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional info..." /></div>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleUpdate} disabled={updateMutation.isPending || !updateType || !location}>
                {updateMutation.isPending ? "Updating..." : "Submit Update"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
