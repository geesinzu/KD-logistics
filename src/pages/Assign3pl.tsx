import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Truck, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Assign3pl() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tplId, setTplId] = useState("");
  const [pickupType, setPickupType] = useState("");
  const [driverId, setDriverId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const { data: shipment } = trpc.shipment.getById.useQuery({ id: Number(id) });
  const { data: tpls } = trpc.tpl.list.useQuery();
  const { data: drivers } = trpc.user.list.useQuery({ role: "driver", status: "active" });
  const driverList = drivers?.users?.filter(u => u.role === "driver" && u.status === "active") ?? [];

  const assignMutation = trpc.shipment.assign3pl.useMutation({
    onSuccess: () => {
      utils.shipment.list.invalidate();
      utils.shipment.getById.invalidate({ id: Number(id) });
      navigate("/shipments");
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!tplId) { setError("Select a 3PL"); return; }
    if (!pickupType) { setError("Select pickup type"); return; }
    if (pickupType === "kedi_driver_drop" && !driverId) { setError("Select a driver for drop-off"); return; }
    assignMutation.mutate({
      shipmentId: Number(id),
      tplId: Number(tplId),
      tplPickupType: pickupType as "kedi_driver_drop" | "tpl_pickup_direct",
      assignedDriverId: pickupType === "kedi_driver_drop" ? Number(driverId) : undefined,
      estimatedDeliveryDate: deliveryDate || undefined,
      specialInstructions: instructions || undefined,
    });
  };

  if (!shipment) return <div className="p-4 text-center">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Assign to 3PL</h1>
      </div>
      <div className="p-4">
        <Card className="border-0 shadow-sm mb-4 bg-indigo-50">
          <CardContent className="p-3 text-xs text-indigo-800">
            <strong>{shipment.trackingId}</strong> - {shipment.actualItemCount} items to {shipment.destinationBranch}
          </CardContent>
        </Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Select 3PL *</Label>
            <Select value={tplId} onValueChange={setTplId}>
              <SelectTrigger><SelectValue placeholder="Choose 3PL partner" /></SelectTrigger>
              <SelectContent>
                {tpls?.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} ({t.pickupOptions === "both" ? "Pickup + Drop-off" : t.pickupOptions === "dropoff_only" ? "Drop-off only" : "Pickup only"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Pickup Type *</Label>
            <Select value={pickupType} onValueChange={setPickupType}>
              <SelectTrigger><SelectValue placeholder="How will 3PL receive the shipment?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kedi_driver_drop">KEDI Driver will drop at 3PL office</SelectItem>
                <SelectItem value="tpl_pickup_direct">3PL will pick up directly from warehouse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {pickupType === "kedi_driver_drop" && (
            <div>
              <Label>Select KEDI Driver *</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue placeholder="Choose driver" /></SelectTrigger>
                <SelectContent>
                  {driverList.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name} - {d.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {pickupType === "tpl_pickup_direct" && (
            <Card className="border-0 shadow-sm bg-blue-50">
              <CardContent className="p-3 flex items-start gap-2 text-xs text-blue-700">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <p>The 3PL will be notified to come pick up directly from the warehouse. No KEDI driver needed.</p>
              </CardContent>
            </Card>
          )}
          <div><Label>Estimated Delivery Date</Label><Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
          <div><Label>Special Instructions</Label><Textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Any special handling notes..." /></div>
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-12" disabled={assignMutation.isPending}>
            <Truck size={16} className="mr-2" /> {assignMutation.isPending ? "Assigning..." : "Assign to 3PL"}
          </Button>
        </form>
      </div>
    </div>
  );
}
