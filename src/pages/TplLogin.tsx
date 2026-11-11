import { SignInFrame } from "@/components/SignInFrame";
import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export default function TplLogin() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.tpl.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("kedi_token", data.token);
      localStorage.setItem("kedi_tpl_id", String(data.user.tplId));
      window.location.href = "/tpl-portal";
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ phone, password });
  };

  return (
    <SignInFrame partner>
        <div className="auth-form-heading">
          <h1 className="text-xl font-bold text-[#1E293B]">3PL Portal</h1>
          <p className="text-sm text-gray-500">Logistics Partner Login</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tpl-phone">Phone Number</Label>
            <Input id="tpl-phone" autoComplete="username" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 803 111 1111" required />
          </div>
          <div>
            <Label htmlFor="tpl-password">Password</Label>
            <Input id="tpl-password" autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
          </div>
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-12" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in..." : "Sign In as 3PL"}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          KEDI staff? <button onClick={() => navigate("/login")} className="text-[#003B7A] font-medium hover:underline">Login here</button>
        </p>
    </SignInFrame>
  );
}
