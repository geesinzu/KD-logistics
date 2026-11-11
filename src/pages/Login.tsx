import { SignInFrame } from "@/components/SignInFrame";
import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("kedi_token", data.token);
      window.location.href = "/";
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ phone, password });
  };

  return (
    <SignInFrame>
        <div className="auth-form-heading">
          <h1 className="text-xl font-bold text-[#1E293B]">KEDI Logistics</h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input autoComplete="username" type="tel" id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 801 234 5678" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input autoComplete="current-password" id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
          </div>
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <Button type="submit" className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Don't have an account?{" "}
          <button onClick={() => navigate("/signup")} className="text-[#003B7A] font-medium hover:underline">Sign Up</button>
        </p>
        <p className="text-center text-sm text-gray-500 mt-2">
          3PL Partner?{" "}
          <button onClick={() => navigate("/tpl-login")} className="text-indigo-600 font-medium hover:underline">3PL Portal</button>
        </p>
    </SignInFrame>
  );
}
