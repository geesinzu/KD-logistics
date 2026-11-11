import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const emptyForm = { name: "", code: "", city: "", address: "", hubBranchId: "" };

export default function BranchOffices() {
  const { isSuperAdmin } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: branches, isLoading, error, refetch } = trpc.branch.list.useQuery();
  const create = trpc.branch.create.useMutation({
    onSuccess: async () => {
      await utils.branch.list.invalidate();
      setForm(emptyForm);
      setShowForm(false);
      toast.success("Branch office added. Assign its manager under Users.");
    },
  });

  const update = trpc.branch.update.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      toast.success("Branch office updated");
    },
  });
  const isSaving = create.isPending || update.isPending;
  const isHeadOffice = editingId !== null && branches?.some(b => b.id === editingId && (b.id === 19 || b.code === "LHQ" || b.name === "Lagos HQ"));
  function resetForm() {
    create.reset();
    update.reset();
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-[#1E293B]">Branch Offices</h1>
        <Button className="bg-[#003B7A]" onClick={() => { resetForm(); setShowForm(!showForm); }} disabled={isSaving}>
          {showForm ? "Close" : "Add Branch"}
        </Button>
      </div>
      <p className="text-sm text-gray-600">Add an office to make it available for shipments and staff assignments. After adding it, assign a branch manager under <Link to="/users" className="underline text-blue-700">Users</Link>.</p>
      {showForm && (
        <form className="bg-white rounded-lg border p-4 space-y-3" onSubmit={e => {
          e.preventDefault();
          const details = { ...form, hubBranchId: form.hubBranchId ? Number(form.hubBranchId) : null };
          if (editingId !== null) update.mutate({ id: editingId, ...details });
          else create.mutate(details);
        }}>
          <h2 className="font-semibold">{editingId !== null ? "Edit Branch Office" : "Add Branch Office"}</h2>
          {editingId !== null && <p className="text-xs text-gray-500">Route changes apply to new shipments. Existing shipment routes and tracking IDs stay unchanged.</p>}
          {isHeadOffice && <p className="text-xs text-gray-500">Lagos HQ name, code, and direct route are fixed. You can update its city and address.</p>}
          <div><Label htmlFor="branch-name">Office name *</Label><Input id="branch-name" disabled={isHeadOffice || isSaving} required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label htmlFor="branch-code">Branch code *</Label><Input id="branch-code" disabled={isHeadOffice || isSaving} required minLength={2} maxLength={5} pattern="[A-Za-z0-9]{2,5}" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} aria-describedby="code-help" /><p id="code-help" className="text-xs text-gray-500 mt-1">Unique 2–5 letters or numbers. Used in this office’s shipment tracking IDs.</p></div>
          <div><Label htmlFor="branch-city">City</Label><Input id="branch-city" maxLength={50} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label htmlFor="branch-address">Address</Label><Textarea id="branch-address" maxLength={2000} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label htmlFor="branch-hub">Delivery route</Label><select id="branch-hub" className="w-full rounded-md border bg-white p-2 text-sm" value={form.hubBranchId} onChange={e => setForm({ ...form, hubBranchId: e.target.value })} disabled={isLoading || !!error || isHeadOffice || isSaving}>
            <option value="">Direct to this office</option>
            {branches?.filter(b => !b.hubBranchId && b.id !== editingId).map(b => <option key={b.id} value={b.id}>Via {b.name} hub</option>)}
          </select><p className="text-xs text-gray-500 mt-1">Choose a hub if another office receives shipments first and forwards them here.</p></div>
          {(create.error || update.error) && <p role="alert" className="text-sm text-red-600">{(update.error || create.error)?.message}</p>}
          <Button type="submit" className="w-full bg-[#003B7A]" disabled={isSaving || isLoading || !!error}>{isSaving ? "Saving…" : editingId !== null ? "Save Changes" : "Save Branch"}</Button>
        </form>
      )}
      {isLoading && <p role="status">Loading branch offices…</p>}
      {error && <div role="alert"><p className="text-red-600">Could not load branch offices.</p><Button variant="outline" onClick={() => void refetch()}>Try again</Button></div>}
      {branches?.length === 0 && <p>No branch offices yet. Add your first office above.</p>}
      <div className="space-y-2">
        {branches?.map(branch => (
          <div key={branch.id} className="bg-white rounded-lg border p-3">
            <div className="flex justify-between gap-2"><h2 className="font-semibold">{branch.name}</h2><span className="text-xs rounded bg-blue-50 px-2 py-1 text-blue-800">{branch.code}</span></div>
            {branch.city && <p className="text-sm text-gray-600">{branch.city}</p>}
            {branch.address && <p className="text-sm text-gray-600 whitespace-pre-wrap">{branch.address}</p>}
            <p className="text-xs text-gray-500 mt-2">{branch.hubBranchId ? `Via ${branches.find(b => b.id === branch.hubBranchId)?.name ?? "configured"} hub` : "Direct delivery"}</p>
            {isSuperAdmin && <Button variant="outline" className="mt-3" disabled={isSaving} aria-label={`Edit ${branch.name}`} onClick={() => {
              create.reset(); update.reset();
              setEditingId(branch.id);
              setForm({ name: branch.name, code: branch.code, city: branch.city ?? "", address: branch.address ?? "", hubBranchId: branch.hubBranchId ? String(branch.hubBranchId) : "" });
              setShowForm(true);
              document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
            }}>Edit Branch</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}
