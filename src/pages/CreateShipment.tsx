import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Package, MapPin } from "lucide-react";

export default function CreateShipment() {
  const navigate = useNavigate();
  const [destBranchId, setDestBranchId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const { data: branches } = trpc.branch.list.useQuery();

  const createMutation = trpc.shipment.create.useMutation({
    onSuccess: () => {
      utils.shipment.list.invalidate();
      utils.shipment.recentActivity.invalidate();
      navigate("/shipments");
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!destBranchId) { setError("Please select a destination branch"); return; }
    createMutation.mutate({
      destBranchId: Number(destBranchId),
      receiverName: receiverName || undefined,
      receiverPhone: receiverPhone || undefined,
      description: description || undefined,
      priority: priority as "normal" | "urgent",
    });
  };

  // Filter out Lagos HQ from destination (it's always the origin)
  const destBranches = branches?.filter(b => b.name !== "Lagos HQ") || [];

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Create Shipment</h1>
      </div>
      <div className="p-4">
        {/* Origin - Always Lagos HQ */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 flex items-center gap-2">
          <MapPin size={16} className="text-blue-600" />
          <div>
            <p className="text-[10px] text-blue-500 uppercase font-medium">From (Origin)</p>
            <p className="text-sm font-semibold text-blue-800">Lagos HQ Warehouse</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>To (Destination Branch) *</Label>
            <Select value={destBranchId} onValueChange={setDestBranchId}>
              <SelectTrigger><SelectValue placeholder="Select destination branch" /></SelectTrigger>
              <SelectContent>
                {destBranches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name} ({b.city})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Receiver Name</Label><Input value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Who receives this shipment" /></div>
          <div><Label>Receiver Phone</Label><Input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="+234 802 345 6789" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's being shipped..." /></div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <Button type="submit" className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12" disabled={createMutation.isPending}>
            <Package size={16} className="mr-2" /> {createMutation.isPending ? "Creating..." : "Create Shipment"}
          </Button>
        </form>
      </div>
    </div>
  );
}
