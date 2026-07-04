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
import { Search, UserPlus, Truck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Users() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", phone: "", role: "driver", password: "" });

  // 3PL staff
  const [showAdd3pl, setShowAdd3pl] = useState(false);
  const [new3pl, setNew3pl] = useState({ name: "", phone: "", password: "", tplId: "" });
  const [tplError, setTplError] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.user.list.useQuery({ page, limit: 20, search: search || undefined, status: statusFilter || undefined });

  const updateStatusMutation = trpc.user.updateStatus.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); toast.success("User status updated"); },
    onError: (err) => toast.error(err.message || "Failed to update status"),
  });
  const updateRoleMutation = trpc.user.updateRole.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); toast.success("Role updated"); },
    onError: (err) => toast.error(err.message || "Failed to update role"),
  });
  const createUserMutation = trpc.user.create.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); setShowAdd(false); setNewUser({ name: "", phone: "", role: "driver", password: "" }); toast.success("User created successfully"); },
    onError: (err) => toast.error(err.message || "Failed to create user"),
  });

  const { data: tplList } = trpc.tpl.list.useQuery();
  const { data: tplUsersList, error: tplListError } = trpc.tpl.listUsers.useQuery(undefined, {
    enabled: showAdd3pl,
    onError: (err: any) => { toast.error("Failed to load 3PL staff: " + (err.message || "Unknown error")); },
  });
  const create3plUserMutation = trpc.tpl.createUser.useMutation({
    onSuccess: () => {
      utils.tpl.listUsers.invalidate();
      setShowAdd3pl(false);
      setNew3pl({ name: "", phone: "", password: "", tplId: "" });
      setTplError("");
      toast.success("3PL staff account created successfully");
    },
    onError: (err) => {
      const msg = err.message || "Failed to create 3PL staff account";
      setTplError(msg);
      toast.error(msg);
    },
  });
  const delete3plUserMutation = trpc.tpl.deleteUser.useMutation({
    onSuccess: () => { utils.tpl.listUsers.invalidate(); toast.success("3PL staff deleted"); },
    onError: (err) => toast.error(err.message || "Failed to delete 3PL staff"),
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
        <div className="flex gap-2">
          <Button size="sm" className="bg-[#003B7A] hover:bg-[#002B5A] h-9" onClick={() => setShowAdd(true)}>
            <UserPlus size={14} className="mr-1" /> Add User
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-9" onClick={() => setShowAdd3pl(true)}>
            <Truck size={14} className="mr-1" /> Add 3PL Staff
          </Button>
        </div>
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
                <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KEDI_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Password</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Default: kedi1234" /></div>
              <Button className="w-full bg-[#003B7A]" onClick={() => createUserMutation.mutate({
                name: newUser.name, phone: newUser.phone, role: newUser.role,
                password: newUser.password || "kedi1234",
              })} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add 3PL Staff Dialog */}
      {showAdd3pl && (
        <Dialog open={showAdd3pl} onOpenChange={setShowAdd3pl}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add 3PL Staff</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 bg-blue-50 p-2 rounded">This creates a login for 3PL partner staff to access the 3PL Portal.</p>
              <div><Label>Name</Label><Input value={new3pl.name} onChange={e => setNew3pl({ ...new3pl, name: e.target.value })} placeholder="Staff full name" /></div>
              <div><Label>Phone</Label><Input value={new3pl.phone} onChange={e => setNew3pl({ ...new3pl, phone: e.target.value })} placeholder="08118018662" /></div>
              <div><Label>3PL Company *</Label>
                <Select value={new3pl.tplId} onValueChange={v => setNew3pl({ ...new3pl, tplId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select 3PL company..." /></SelectTrigger>
                  <SelectContent>
                    {tplList?.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Password</Label><Input type="password" value={new3pl.password} onChange={e => setNew3pl({ ...new3pl, password: e.target.value })} placeholder="Default: tpl1234" /></div>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                setTplError("");
                create3plUserMutation.mutate({
                  name: new3pl.name,
                  phone: new3pl.phone,
                  password: new3pl.password || "tpl1234",
                  tplId: Number(new3pl.tplId),
                });
              }} disabled={create3plUserMutation.isPending || !new3pl.tplId}>
                {create3plUserMutation.isPending ? "Creating..." : "Create 3PL Account"}
              </Button>
              {tplError && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200 mt-1">
                  {tplError}
                </div>
              )}
              {tplListError && (
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-1">
                  Could not load 3PL staff list. You may not have permission to view this data.
                </div>
              )}

              {/* Existing 3PL staff list */}
              {tplUsersList && tplUsersList.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">Existing 3PL Staff</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tplUsersList.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-2 text-xs">
                        <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-[10px]">
                          {u.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{u.name}</p>
                          <p className="text-gray-400">{u.phone} | {u.tplName}</p>
                        </div>
                        <button
                          onClick={() => { if (confirm(`Delete 3PL staff "${u.name}"? This cannot be undone.`)) delete3plUserMutation.mutate({ id: u.id }); }}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete 3PL staff"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
