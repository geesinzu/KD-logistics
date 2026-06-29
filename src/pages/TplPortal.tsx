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
import { Truck, LogOut, MapPin, Package, CheckCircle2 } from "lucide-react";

export default function TplPortal() {
  const [filter, setFilter] = useState("all");
  const [selectedShipment, setSelectedShipment] = useState<any>(null);
  const [updateType, setUpdateType] = useState("");
  const [location, setLocation] = useState("");
  const [deliveredQty, setDeliveredQty] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: shipments, isLoading } = trpc.shipment.list.useQuery({ page: 1, limit: 50 });

  const updateMutation = trpc.shipment.tplUpdateLocation.useMutation({
    onSuccess: () => {
      utils.shipment.list.invalidate();
      setSelectedShipment(null);
      setUpdateType(""); setLocation(""); setDeliveredQty(""); setNotes("");
    },
  });

  const handleUpdate = () => {
    if (!selectedShipment || !updateType || !location) return;
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

  const tplId = Number(localStorage.getItem("kedi_tpl_id") || 0);
  const myShipments = shipments?.shipments?.filter((s: any) => s.tplId === tplId) || [];

  const filtered = myShipments.filter((s: any) => {
    if (filter === "active") return !["delivered", "completed", "cancelled"].includes(s.status);
    if (filter === "delivered") return ["delivered", "completed"].includes(s.status);
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-[#0F172A] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck size={20} className="text-indigo-400" />
          <h1 className="text-sm font-bold">3PL Portal</h1>
        </div>
        <button onClick={handleLogout} className="p-1.5 text-white/70 hover:text-white"><LogOut size={18} /></button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><Package size={16} className="mx-auto mb-1 text-blue-600" /><p className="text-xl font-bold">{myShipments.length}</p><p className="text-[10px] text-gray-500">Assigned</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><Truck size={16} className="mx-auto mb-1 text-yellow-600" /><p className="text-xl font-bold">{myShipments.filter((s: any) => !["delivered", "completed"].includes(s.status)).length}</p><p className="text-[10px] text-gray-500">Active</p></CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><CheckCircle2 size={16} className="mx-auto mb-1 text-green-600" /><p className="text-xl font-bold">{myShipments.filter((s: any) => ["delivered", "completed"].includes(s.status)).length}</p><p className="text-[10px] text-gray-500">Done</p></CardContent></Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-3">
          {["all", "active", "delivered"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${filter === f ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Shipments */}
        {isLoading && <p className="text-center py-4 text-gray-400">Loading...</p>}
        {filtered.length === 0 && <p className="text-center py-8 text-gray-400">No shipments</p>}
        <div className="space-y-2">
          {filtered.map((s: any) => (
            <Card key={s.id} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[#003B7A]">{s.trackingId || `#${s.id}`}</span>
                  <Badge className={`text-[9px] ${STATUS_COLORS[s.status] || ""}`}>{STATUS_LABELS[s.status] || s.status}</Badge>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">To: {s.destinationBranch} | {s.actualItemCount || 0} items</p>
                {!["delivered", "completed", "cancelled"].includes(s.status) && (
                  <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
                    onClick={() => { setSelectedShipment(s); setUpdateType(""); }}>
                    <MapPin size={12} className="mr-1" /> Update Status
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Update Dialog */}
      {selectedShipment && (
        <Dialog open={!!selectedShipment} onOpenChange={() => setSelectedShipment(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Update {selectedShipment.trackingId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Update Type *</Label>
                <Select value={updateType} onValueChange={setUpdateType}>
                  <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
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
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g., Onitsha Expressway" />
              </div>
              {(updateType === "partial_delivery") && (
                <div>
                  <Label>Quantity Delivered Now</Label>
                  <Input type="number" value={deliveredQty} onChange={e => setDeliveredQty(e.target.value)} placeholder={`of ${selectedShipment.actualItemCount || 0} total`} />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional info..." />
              </div>
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
