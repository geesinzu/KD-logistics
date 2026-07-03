import { Outlet, useNavigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Home, Package, Users, ScanLine, UserCircle } from "lucide-react";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const role = user?.role;
  const isSuperAdmin = role === "super_admin";

  const tabs = [
    { path: "/", icon: Home, label: "Home" },
    { path: "/shipments", icon: Package, label: "Shipments" },
    ...(isSuperAdmin ? [{ path: "/users", icon: Users, label: "Users" }] : []),
    { path: "/scan", icon: ScanLine, label: "Scan" },
    { path: "/profile", icon: UserCircle, label: "Profile" },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
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
