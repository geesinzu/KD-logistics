import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Info } from "lucide-react";

const PHONE_REGEX = /^\d{11}$/;

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [branchId, setBranchId] = useState("19");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: branches } = trpc.branch.list.useQuery();

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: (data) => {
      setSuccess(data.message);
      setTimeout(() => navigate("/login"), 3000);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!PHONE_REGEX.test(phone)) { setError("Enter an 11-digit phone number"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    signupMutation.mutate({ name, phone, password, branchId: branchId ? Number(branchId) : undefined });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#003B7A] to-[#0F172A] flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-[#003B7A] rounded-full flex items-center justify-center mb-3">
            <Package size={32} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[#1E293B]">Create Account</h1>
          <p className="text-sm text-gray-500">Join KEDI Logistics</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Full Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" required /></div>
          <div>
            <Label>Phone Number</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="08012345678" inputMode="numeric" maxLength={11} required />
          </div>
          <div>
            <Label>Branch (optional)</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Choose a branch..." /></SelectTrigger>
              <SelectContent>{branches?.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">Your role is assigned by an admin when your account is approved.</p>
          <div><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required /></div>
          <div><Label>Confirm Password</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required /></div>
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 p-2 rounded flex items-center gap-1"><Info size={14}/>{success}</p>}
          <Button type="submit" className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12" disabled={signupMutation.isPending}>
            {signupMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account? <button onClick={() => navigate("/login")} className="text-[#003B7A] font-medium hover:underline">Sign In</button>
        </p>
      </div>
    </div>
  );
}
