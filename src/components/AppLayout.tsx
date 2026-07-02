import { Outlet, useNavigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Home, Package, Users, ScanLine, UserCircle, Bell } from "lucide-react";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Poll every 30 seconds
  });

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
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
      {/* Top header with notification bell */}
      <header className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/kedi-logo.png" alt="KEDI" className="h-7" />
          <span className="text-sm font-bold">KEDI Logistics</span>
        </div>
        <button
          onClick={() => navigate("/notifications")}
          className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <Bell size={20} />
          {unreadCount ? (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-50 flex items-center justify-around px-2">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path || (tab.path !== "/" && location.pathname.startsWith(tab.path));
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center w-16 h-full rounded-lg transition-colors ${isActive ? "text-[#003B7A]" : "text-gray-400"}`}>
              <tab.icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span className={`text-[10px] mt-0.5 ${isActive ? "font-medium" : ""}`}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
