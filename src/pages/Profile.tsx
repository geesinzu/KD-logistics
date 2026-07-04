import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@contracts/constants";
import { UserCircle, Phone, Shield, LogOut, Package, Camera, Loader2, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

function resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas error")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Image load error"));
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe, isConfiguring } = usePushNotifications();

  const uploadMutation = trpc.user.uploadProfilePicture.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setUploading(false);
    },
    onError: (err: any) => {
      alert(err.message);
      setUploading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please select an image file"); return; }

    setUploading(true);
    try {
      const base64 = await resizeImage(file, 400, 400);
      uploadMutation.mutate({ imageBase64: base64 });
    } catch {
      alert("Failed to process image. Try again.");
      setUploading(false);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-[#1E293B] mb-4">Profile</h1>

      {/* User card with profile picture */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            {user?.profilePicture ? (
              <img
                src={user.profilePicture}
                alt={user.name || "Profile"}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#003B7A]"
              />
            ) : (
              <div className="w-16 h-16 bg-[#003B7A] rounded-full flex items-center justify-center text-white text-xl font-bold">
                {user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
              </div>
            )}
            {/* Upload button overlay */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center"
            >
              {uploading ? <Loader2 size={12} className="animate-spin text-[#003B7A]" /> : <Camera size={12} className="text-[#003B7A]" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[#1E293B] truncate">{user?.name}</h2>
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

      {/* Push Notifications */}
      {isSupported && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <Bell size={12} /> Push Notifications
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {isSubscribed ? "Notifications enabled" : permission === "denied" ? "Notifications blocked" : "Notifications disabled"}
                </p>
                <p className="text-xs text-gray-400">
                  {isSubscribed ? "You'll receive alerts for shipment events" : permission === "denied" ? "Enable in browser settings" : "Get notified when shipments arrive"}
                </p>
              </div>
              <Button
                size="sm"
                variant={isSubscribed ? "outline" : "default"}
                className={isSubscribed ? "text-red-600 border-red-200" : "bg-[#003B7A]"}
                disabled={permission === "denied" || isConfiguring}
                onClick={async () => {
                  if (isSubscribed) {
                    await unsubscribe();
                    toast.success("Push notifications disabled");
                  } else {
                    const ok = await subscribe();
                    if (ok) toast.success("Push notifications enabled");
                    else toast.error("Failed to enable notifications");
                  }
                }}
              >
                {isConfiguring ? <Loader2 size={14} className="animate-spin" /> :
                  isSubscribed ? <><BellOff size={14} className="mr-1" /> Disable</> :
                  <><Bell size={14} className="mr-1" /> Enable</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
