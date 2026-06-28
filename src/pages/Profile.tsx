import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@contracts/constants";
import { UserCircle, Phone, Shield, LogOut, Package } from "lucide-react";

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-[#1E293B] mb-4">Profile</h1>

      {/* User card */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-16 h-16 bg-[#003B7A] rounded-full flex items-center justify-center text-white text-xl font-bold">
            {user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">{user?.name}</h2>
            <p className="text-sm text-gray-500 flex items-center gap-1"><Phone size={12} />{user?.phone}</p>
            <p className="text-xs text-[#003B7A] font-medium mt-0.5 flex items-center gap-1"><Shield size={12} />{ROLE_LABELS[user?.role as keyof typeof ROLE_LABELS] || user?.role}</p>
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Account Status</h3>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${user?.status === "active" ? "bg-green-500" : user?.status === "pending" ? "bg-yellow-500" : "bg-red-500"}`} />
            <span className="text-sm capitalize">{user?.status}</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-0">
          {isAdmin && (
            <button onClick={() => navigate("/users")} className="w-full flex items-center gap-3 p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left">
              <Shield size={18} className="text-[#003B7A]" /><span className="text-sm">User Management</span>
            </button>
          )}
          <button onClick={() => navigate("/shipments")} className="w-full flex items-center gap-3 p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left">
            <Package size={18} className="text-[#003B7A]" /><span className="text-sm">My Shipments</span>
          </button>
          <button onClick={() => navigate("/scan")} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
            <UserCircle size={18} className="text-[#003B7A]" /><span className="text-sm">QR Scanner</span>
          </button>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button variant="destructive" className="w-full h-12" onClick={logout}>
        <LogOut size={16} className="mr-2" /> Logout
      </Button>
    </div>
  );
}
