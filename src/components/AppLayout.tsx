import { Outlet, useNavigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { Home, Package, Users, ScanLine, UserCircle, Bell } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const unreadCount = useUnreadNotificationCount();

  const role = user?.role;
  const isAdmin = role === "super_admin" || role === "admin";

  const tabs = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/shipments", icon: Package, label: "Shipments" },
    ...(isAdmin ? [{ path: "/users", icon: Users, label: "Users" }] : []),
    { path: "/scan", icon: ScanLine, label: "Scan" },
    { path: "/profile", icon: UserCircle, label: "Profile" },
  ];

  return (
    <div className="flex flex-col h-screen bg-ground">
      <Toaster position="top-center" richColors />
      <header className="flex items-center justify-between px-4 h-12 bg-white border-b border-[#E8E4DC] shrink-0">
        <img src="/kedi-logo.png" alt="KEDI" className="h-6" />
        <button
          onClick={() => navigate("/notifications")}
          className="relative p-1.5 text-gray-500 hover:text-navy transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </header>
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E8E4DC] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-50 flex items-center justify-around px-2">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path || (tab.path !== "/" && location.pathname.startsWith(tab.path));
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center w-16 h-full rounded-lg transition-colors ${isActive ? "text-navy" : "text-gray-400"}`}>
              <tab.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span className={`text-[10px] mt-0.5 ${isActive ? "font-medium" : ""}`}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
