import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const emptyForm = { name: "", code: "", city: "", address: "", hubBranchId: "" };

export default function BranchOffices() {
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

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-[#1E293B]">Branch Offices</h1>
        <Button className="bg-[#003B7A]" onClick={() => { create.reset(); setShowForm(!showForm); }} disabled={create.isPending}>
          {showForm ? "Close" : "Add Branch"}
        </Button>
      </div>
      <p className="text-sm text-gray-600">Add an office to make it available for shipments and staff assignments. After adding it, assign a branch manager under <Link to="/users" className="underline text-blue-700">Users</Link>.</p>
      {showForm && (
        <form className="bg-white rounded-lg border p-4 space-y-3" onSubmit={e => {
          e.preventDefault();
          create.mutate({ ...form, hubBranchId: form.hubBranchId ? Number(form.hubBranchId) : null });
        }}>
          <h2 className="font-semibold">Add Branch Office</h2>
          <div><Label htmlFor="branch-name">Office name *</Label><Input id="branch-name" required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label htmlFor="branch-code">Branch code *</Label><Input id="branch-code" required minLength={2} maxLength={5} pattern="[A-Za-z0-9]{2,5}" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} aria-describedby="code-help" /><p id="code-help" className="text-xs text-gray-500 mt-1">Unique 2–5 letters or numbers. Used in this office’s shipment tracking IDs.</p></div>
          <div><Label htmlFor="branch-city">City</Label><Input id="branch-city" maxLength={50} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label htmlFor="branch-address">Address</Label><Textarea id="branch-address" maxLength={2000} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label htmlFor="branch-hub">Delivery route</Label><select id="branch-hub" className="w-full rounded-md border bg-white p-2 text-sm" value={form.hubBranchId} onChange={e => setForm({ ...form, hubBranchId: e.target.value })} disabled={isLoading || !!error}>
            <option value="">Direct to this office</option>
            {branches?.filter(b => !b.hubBranchId).map(b => <option key={b.id} value={b.id}>Via {b.name} hub</option>)}
          </select><p className="text-xs text-gray-500 mt-1">Choose a hub if another office receives shipments first and forwards them here.</p></div>
          {create.error && <p role="alert" className="text-sm text-red-600">{create.error.message}</p>}
          <Button type="submit" className="w-full bg-[#003B7A]" disabled={create.isPending || isLoading || !!error}>{create.isPending ? "Adding…" : "Save Branch"}</Button>
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
          </div>
        ))}
      </div>
    </div>
  );
}
