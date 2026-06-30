import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_LABELS, KEDI_ROLES } from "@contracts/constants";
import { Search, UserPlus } from "lucide-react";

export default function Users() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", phone: "", role: "driver", password: "", branchId: "19" });

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.user.list.useQuery({ page, limit: 20, search: search || undefined, status: statusFilter || undefined });
  const { data: branchesData } = trpc.branch.list.useQuery();

  const updateStatusMutation = trpc.user.updateStatus.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); },
  });
  const updateRoleMutation = trpc.user.updateRole.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); },
  });
  const createUserMutation = trpc.user.create.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); setShowAdd(false); setNewUser({ name: "", phone: "", role: "driver", password: "", branchId: "19" }); },
  });

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    suspended: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold text-[#1E293B]">Users</h1>
        <Button size="sm" className="bg-[#003B7A] hover:bg-[#002B5A] h-9" onClick={() => setShowAdd(true)}>
          <UserPlus size={14} className="mr-1" /> Add
        </Button>
      </div>

      {/* Search and filter */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input className="pl-8 h-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User list */}
      {isLoading && <p className="text-center py-4 text-gray-400">Loading...</p>}
      <div className="space-y-2">
        {data?.users?.length === 0 && <p className="text-center py-8 text-gray-400">No users found</p>}
        {data?.users?.map(u => (
          <Card key={u.id} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#003B7A] rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {u.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{u.name}</p>
                    <Badge className={`text-[9px] ${statusColors[u.status] || ""}`}>{u.status}</Badge>
                  </div>
                  <p className="text-[11px] text-gray-500">{u.phone}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[9px]">{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {u.status === "pending" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                      onClick={() => updateStatusMutation.mutate({ id: u.id, status: "active" })}>
                      Activate
                    </Button>
                  )}
                  <Select value={u.role} onValueChange={(val) => updateRoleMutation.mutate({ id: u.id, role: val })}>
                    <SelectTrigger className="h-6 text-[10px] w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KEDI_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add User Dialog */}
      {showAdd && (
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="Full name" /></div>
              <div><Label>Phone</Label><Input value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} placeholder="+234 801 234 5678" /></div>
              <div><Label>Role</Label>
                <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v, branchId: v === "branch_manager" ? "" : "19" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KEDI_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {newUser.role === "branch_manager" && (
                <div><Label>Branch *</Label>
                  <Select value={newUser.branchId} onValueChange={v => setNewUser({ ...newUser, branchId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a branch...">
                        {branchesData?.find((b: any) => String(b.id) === newUser.branchId)?.name || "Choose a branch..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {branchesData?.map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Password</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Default: kedi1234" /></div>
              <Button className="w-full bg-[#003B7A]" onClick={() => createUserMutation.mutate({
                name: newUser.name, phone: newUser.phone, role: newUser.role,
                password: newUser.password || "kedi1234",
                branchId: Number(newUser.branchId) || 19,
              })} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
