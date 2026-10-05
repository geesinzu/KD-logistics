import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MapPin } from "lucide-react";

type Priority = "normal" | "urgent" | "low";

interface ReviewRow {
  branchId: number;
  name: string;
  city: string;
  isHub: boolean;
  receiverName: string;
  receiverPhone: string;
  priority: Priority;
  hasHistory: boolean;
}

const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", urgent: "Urgent" };
const PRIORITY_STYLE: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-slate-100 text-slate-700",
  urgent: "bg-red-50 text-red-700",
};

export default function BulkCreateShipments() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [description, setDescription] = useState("");
  const [defaultPriority, setDefaultPriority] = useState<Priority>("normal");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [reviewSelected, setReviewSelected] = useState<Set<number>>(new Set());
  const [loadingReceivers, setLoadingReceivers] = useState(false);
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const { data: branches } = trpc.branch.list.useQuery();
  const createBulkMutation = trpc.shipment.createBulk.useMutation({
    onSuccess: () => {
      utils.shipment.list.invalidate();
      utils.shipment.recentActivity.invalidate();
      navigate("/shipments");
    },
    onError: (err) => setError(err.message),
  });

  // Same exclusion as the single-create form -- Lagos HQ is always the origin.
  const destBranches = branches?.filter(b => b.name !== "Lagos HQ") || [];
  const allSelected = destBranches.length > 0 && destBranches.every(b => selected.has(b.id));

  function toggleBranch(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(destBranches.map(b => b.id)));
  }

  async function handleContinue() {
    setError("");
    if (selected.size === 0) { setError("Select at least one branch"); return; }
    const ids = [...selected];
    setLoadingReceivers(true);
    let lastReceivers: { branchId: number; receiverName: string | null; receiverPhone: string | null }[] = [];
    try {
      lastReceivers = await utils.shipment.lastReceiverForBranches.fetch({ branchIds: ids });
    } catch {
      // Fall through with no pre-fill rather than blocking the flow.
    }
    setLoadingReceivers(false);
    const byBranch = new Map(lastReceivers.map(r => [r.branchId, r]));
    const newRows: ReviewRow[] = ids.map(id => {
      const b = destBranches.find(x => x.id === id);
      const prior = byBranch.get(id);
      return {
        branchId: id,
        name: b?.name ?? "Unknown",
        city: b?.city ?? "",
        isHub: !!b?.hubBranchId,
        receiverName: prior?.receiverName || "",
        receiverPhone: prior?.receiverPhone || "",
        priority: defaultPriority,
        hasHistory: !!prior,
      };
    });
    setRows(newRows);
    setReviewSelected(new Set());
    setStep(2);
  }

  function updateRow(branchId: number, patch: Partial<ReviewRow>) {
    setRows(prev => prev.map(r => r.branchId === branchId ? { ...r, ...patch } : r));
  }
  function toggleReviewRow(branchId: number) {
    setReviewSelected(prev => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId); else next.add(branchId);
      return next;
    });
  }
  function applyPriorityToSelected(priority: Priority) {
    setRows(prev => prev.map(r => reviewSelected.has(r.branchId) ? { ...r, priority } : r));
    setReviewSelected(new Set());
  }

  function handleSubmit() {
    setError("");
    createBulkMutation.mutate({
      description: description || undefined,
      branches: rows.map(r => ({
        destBranchId: r.branchId,
        receiverName: r.receiverName || undefined,
        receiverPhone: r.receiverPhone || undefined,
        priority: r.priority,
      })),
    });
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => step === 2 ? setStep(1) : navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">{step === 1 ? "Bulk Create Shipments" : `Review (${rows.length})`}</h1>
      </div>

      <div className={`p-4 ${step === 2 ? "pb-24" : ""}`}>
        {step === 1 ? (
          <>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-blue-600" />
              <div>
                <p className="text-[10px] text-blue-500 uppercase font-medium">From (Origin)</p>
                <p className="text-sm font-semibold text-blue-800">Lagos HQ Warehouse</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <Label>Select Branches ({selected.size} of {destBranches.length})</Label>
              <button type="button" onClick={toggleAll} className="text-xs text-blue-600 font-medium">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 mb-4 overflow-hidden">
              {destBranches.map(b => (
                <label key={b.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleBranch(b.id)} className="w-4 h-4 accent-[#003B7A] flex-shrink-0" />
                  <span className="text-sm text-[#1E293B] flex-1">
                    {b.name}
                    {b.hubBranchId && <span className="ml-1.5 text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5">HUB</span>}
                  </span>
                  <span className="text-[11px] text-gray-400">{b.city}</span>
                </label>
              ))}
            </div>

            <div className="space-y-4">
              <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's being shipped to all these branches..." /></div>
              <div>
                <Label>Priority (default for all)</Label>
                <Select value={defaultPriority} onValueChange={v => setDefaultPriority(v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-400 mt-1">You can change individual branches' priority on the next screen.</p>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-4">{error}</p>}
            <Button className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12 mt-4" onClick={handleContinue} disabled={loadingReceivers}>
              {loadingReceivers ? "Loading..." : `Continue to Review (${selected.size})`}
            </Button>
          </>
        ) : (
          <>
            {description && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 mb-3 text-xs text-amber-800">
                Description: <strong>&quot;{description}&quot;</strong> applies to all {rows.length}.
              </div>
            )}
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.branchId} className="bg-white rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={reviewSelected.has(r.branchId)} onChange={() => toggleReviewRow(r.branchId)} className="w-4 h-4 accent-[#003B7A]" />
                      <span className="text-sm font-semibold text-[#1E293B]">
                        {r.name}
                        {r.isHub && <span className="ml-1.5 text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-1.5 py-0.5">HUB</span>}
                      </span>
                    </label>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[r.priority]}`}>{PRIORITY_LABEL[r.priority]}</span>
                  </div>
                  <div className="flex gap-2">
                    <Input value={r.receiverName} onChange={e => updateRow(r.branchId, { receiverName: e.target.value })} placeholder="Receiver name" className="text-xs h-8" />
                    <Input value={r.receiverPhone} onChange={e => updateRow(r.branchId, { receiverPhone: e.target.value })} placeholder="Receiver phone" className="text-xs h-8" />
                  </div>
                  <p className={`text-[10px] mt-1 ${r.hasHistory ? "text-gray-400" : "text-amber-600"}`}>
                    {r.hasHistory ? "Pulled from their last shipment — edit if it's changed" : "No prior shipment to this branch — enter manually"}
                  </p>
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-3">{error}</p>}
          </>
        )}
      </div>

      {step === 2 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-200 p-3">
          {reviewSelected.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 flex-shrink-0">{reviewSelected.size} selected</span>
              <button onClick={() => applyPriorityToSelected("low")} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-gray-100 text-gray-700">Low</button>
              <button onClick={() => applyPriorityToSelected("normal")} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-slate-100 text-slate-700">Normal</button>
              <button onClick={() => applyPriorityToSelected("urgent")} className="flex-1 text-xs font-semibold py-2 rounded-lg bg-red-50 text-red-700">Urgent</button>
            </div>
          ) : (
            <Button className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12" onClick={handleSubmit} disabled={createBulkMutation.isPending}>
              {createBulkMutation.isPending ? "Creating..." : `Create ${rows.length} Shipments`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
