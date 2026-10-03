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
import { toast } from "sonner";
import { Search, UserPlus, Truck, Trash2 } from "lucide-react";

interface PendingUser { id: number; name: string; role: string; branchId: number | null }

const PHONE_REGEX = /^\d{11}$/;
function digitsOnly11(v: string) { return v.replace(/\D/g, "").slice(0, 11); }

export default function Users() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page] = useState(1);

  // KEDI user dialog
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", phone: "", role: "driver", password: "", branchId: "19" });

  // 3PL staff dialog
  const [showAdd3pl, setShowAdd3pl] = useState(false);
  const [new3pl, setNew3pl] = useState({ name: "", phone: "", password: "", tplId: "" });

  // Review a pending signup. Signup itself never asks for a role -- the
  // real role list can't cover every actual KEDI job title, so instead of
  // self-selecting a "closest match" that an admin might just rubber-stamp,
  // the role starts unset here and the admin has to actually choose it.
  // Branch is still collected at signup (that list genuinely is complete),
  // so it's pre-filled if they picked one.
  const [reviewUser, setReviewUser] = useState<PendingUser | null>(null);
  const [reviewRole, setReviewRole] = useState("");
  const [reviewBranchId, setReviewBranchId] = useState("");
  function openReview(u: PendingUser) {
    setReviewUser(u);
    setReviewRole("");
    setReviewBranchId(u.branchId ? String(u.branchId) : "");
  }

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.user.list.useQuery({ page, limit: 20, search: search || undefined, status: statusFilter || undefined });
  const { data: branchesData } = trpc.branch.list.useQuery();
  const { data: tplList } = trpc.tpl.list.useQuery();
  const { data: tplUsersList } = trpc.tpl.listUsers.useQuery(undefined, { enabled: showAdd3pl });

  const approveUserMutation = trpc.user.approveUser.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); setReviewUser(null); toast.success("User approved and activated"); },
    onError: (err) => toast.error(err.message || "Failed to approve user"),
  });
  const createUserMutation = trpc.user.create.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); setShowAdd(false); setNewUser({ name: "", phone: "", role: "driver", password: "", branchId: "19" }); toast.success("User created successfully"); },
    onError: (err) => { toast.error(err.message || "Failed to create user"); },
  });
  const create3plUserMutation = trpc.tpl.createUser.useMutation({
    onSuccess: () => { utils.tpl.listUsers.invalidate(); setShowAdd3pl(false); setNew3pl({ name: "", phone: "", password: "", tplId: "" }); },
  });
  const deleteUserMutation = trpc.user.delete.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); utils.user.stats.invalidate(); },
  });
  const delete3plUserMutation = trpc.tpl.deleteUser.useMutation({
    onSuccess: () => { utils.tpl.listUsers.invalidate(); },
  });

  const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    suspended: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Header with two buttons */}
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
                <div className="flex flex-col gap-1 items-end">
                  {u.status === "pending" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      onClick={() => openReview({ id: u.id, name: u.name, role: u.role, branchId: u.branchId })}>
                      Review
                    </Button>
                  )}
                  <button
                    onClick={() => { if (confirm(`Delete user "${u.name}"? This cannot be undone.`)) deleteUserMutation.mutate({ id: u.id }); }}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete user"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Add KEDI User Dialog ── */}
      {showAdd && (
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add KEDI User</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="Full name" /></div>
              <div><Label>Phone</Label><Input value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: digitsOnly11(e.target.value) })} placeholder="08118018662" inputMode="numeric" maxLength={11} /></div>
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
              })} disabled={createUserMutation.isPending || !PHONE_REGEX.test(newUser.phone)}>
                {createUserMutation.isPending ? "Creating..." : "Create KEDI User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Add 3PL Staff Dialog ── */}
      {showAdd3pl && (
        <Dialog open={showAdd3pl} onOpenChange={setShowAdd3pl}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add 3PL Staff</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 bg-blue-50 p-2 rounded">This creates a login account for 3PL partner staff to access the 3PL Portal.</p>
              <div><Label>Name</Label><Input value={new3pl.name} onChange={e => setNew3pl({ ...new3pl, name: e.target.value })} placeholder="Staff full name" /></div>
              <div><Label>Phone</Label><Input value={new3pl.phone} onChange={e => setNew3pl({ ...new3pl, phone: digitsOnly11(e.target.value) })} placeholder="08118018662" inputMode="numeric" maxLength={11} /></div>
              <div><Label>3PL Company *</Label>
                <Select value={new3pl.tplId} onValueChange={v => setNew3pl({ ...new3pl, tplId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select 3PL company..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tplList?.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Password</Label><Input type="password" value={new3pl.password} onChange={e => setNew3pl({ ...new3pl, password: e.target.value })} placeholder="Default: tpl1234" /></div>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => create3plUserMutation.mutate({
                name: new3pl.name,
                phone: new3pl.phone,
                password: new3pl.password || "tpl1234",
                tplId: Number(new3pl.tplId),
              })} disabled={create3plUserMutation.isPending || !new3pl.tplId || !PHONE_REGEX.test(new3pl.phone)}>
                {create3plUserMutation.isPending ? "Creating..." : "Create 3PL Account"}
              </Button>

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

      {/* ── Review Pending Signup ── */}
      {reviewUser && (
        <Dialog open={!!reviewUser} onOpenChange={(open) => !open && setReviewUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Review Request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold">{reviewUser.name}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {reviewUser.branchId
                    ? `Branch requested: ${branchesData?.find((b: any) => b.id === reviewUser.branchId)?.name || reviewUser.branchId}`
                    : "No branch selected at signup"}
                </p>
              </div>
              <div><Label>Assign Role</Label>
                <Select value={reviewRole} onValueChange={v => { setReviewRole(v); if (v !== "branch_manager" && !reviewBranchId) setReviewBranchId("19"); if (v === "branch_manager") setReviewBranchId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a role..." /></SelectTrigger>
                  <SelectContent>{KEDI_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Assign Branch{reviewRole === "branch_manager" ? " *" : " (optional)"}</Label>
                <Select value={reviewBranchId} onValueChange={setReviewBranchId}>
                  <SelectTrigger><SelectValue placeholder="Choose a branch..." /></SelectTrigger>
                  <SelectContent>{branchesData?.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { if (confirm(`Reject and delete the request from "${reviewUser.name}"? This cannot be undone.`)) { deleteUserMutation.mutate({ id: reviewUser.id }); setReviewUser(null); } }}>
                  Reject
                </Button>
                <Button className="flex-[2] bg-green-600 hover:bg-green-700"
                  disabled={approveUserMutation.isPending || !reviewRole || (reviewRole === "branch_manager" && !reviewBranchId)}
                  onClick={() => approveUserMutation.mutate({ id: reviewUser.id, role: reviewRole, branchId: reviewBranchId ? Number(reviewBranchId) : null })}>
                  {approveUserMutation.isPending ? "Approving..." : "Approve & Activate"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
