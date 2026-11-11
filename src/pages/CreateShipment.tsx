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
  const { data: branches, isLoading: branchesLoading, error: branchesError, refetch: reloadBranches } = trpc.branch.list.useQuery();

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
      priority: priority as "normal" | "urgent" | "low",
    });
  };

  // Filter out Lagos HQ from destination (it's always the origin)
  const destBranches = branches?.filter(b => b.name !== "Lagos HQ") || [];
  // Some branches are served via a hub (e.g. Uyo via PH): the route is fixed by
  // the branch, so the creator just sees it rather than choosing it.
  const selectedBranch = destBranches.find(b => String(b.id) === destBranchId);
  const hubBranch = selectedBranch?.hubBranchId ? branches?.find(b => b.id === selectedBranch.hubBranchId) : undefined;

  return (
    <div className="workflow-page">
      <div className="workflow-header">
        <button onClick={() => navigate(-1)} className="workflow-back" aria-label="Go back"><ArrowLeft size={20} /></button>
        <h1 className="workflow-title">Create Shipment</h1>
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

        <form onSubmit={handleSubmit} className="workflow-form space-y-5">
          <div className="workflow-section-intro"><h2>Where is this shipment going?</h2><p>Choose the receiving office, then add the contact and shipment details.</p></div>
          {branchesError && <p role="alert" className="text-sm text-red-600">Could not load branch offices. <button type="button" className="underline" onClick={() => void reloadBranches()}>Try again</button></p>}
          <div>
            <Label htmlFor="destination">To (Destination Branch) *</Label>
            <Select value={destBranchId} onValueChange={setDestBranchId}>
              <SelectTrigger id="destination" disabled={branchesLoading || !!branchesError}><SelectValue placeholder={branchesLoading ? "Loading offices…" : "Select destination branch"} /></SelectTrigger>
              <SelectContent>
                {destBranches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name} ({b.city})</SelectItem>)}
              </SelectContent>
            </Select>
            {hubBranch && selectedBranch && (
              <p className="mt-2 rounded-lg bg-blue-50 border border-blue-100 p-2 text-xs text-blue-800">
                Routed via <strong>{hubBranch.name}</strong> hub, then onward to {selectedBranch.name}. Both branch managers will be notified.
              </p>
            )}
          </div>
          <div><Label htmlFor="receiver-name">Receiver Name</Label><Input id="receiver-name" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Who receives this shipment" /></div>
          <div><Label htmlFor="receiver-phone">Receiver Phone</Label><Input id="receiver-phone" type="tel" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="+234 802 345 6789" /></div>
          <div><Label htmlFor="shipment-description">Description</Label><Textarea id="shipment-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's being shipped..." /></div>
          <div>
            <Label htmlFor="shipment-priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="shipment-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <Button type="submit" className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12" disabled={createMutation.isPending || branchesLoading || !!branchesError}>
            <Package size={16} className="mr-2" /> {createMutation.isPending ? "Creating..." : "Create Shipment"}
          </Button>
        </form>
      </div>
    </div>
  );
}
