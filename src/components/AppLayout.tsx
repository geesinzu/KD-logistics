import { Outlet, NavLink, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { usePushSelfHeal } from "@/hooks/usePushNotifications";
import { LayoutDashboard, Package, Users, ScanLine, UserCircle, Bell, Building2, BarChart3, ArrowUpRight } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ROLE_LABELS } from "@contracts/constants";
import "./workspace.css";

export function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const unreadCount = useUnreadNotificationCount();
  usePushSelfHeal();
  const role = user?.role;
  const isAdmin = role === "super_admin" || role === "admin";
  const tabs = [
    { path: "/", icon: LayoutDashboard, label: "Overview" },
    { path: "/shipments", icon: Package, label: "Shipments" },
    ...(isAdmin ? [{ path: "/users", icon: Users, label: "Users" }, { path: "/branches", icon: Building2, label: "Branches" }] : []),
    { path: "/scan", icon: ScanLine, label: "Scan" },
    { path: "/profile", icon: UserCircle, label: "Profile" },
  ];
  const canReport = role && ["super_admin", "admin", "logistics_officer", "viewer"].includes(role);
  const title = location.pathname.startsWith("/reports") ? "Reports" : tabs.find(t => t.path !== "/" && location.pathname.startsWith(t.path))?.label ?? "Overview";
  const initials = user?.name.split(" ").map(part => part[0]).slice(0, 2).join("") ?? "";
  const roleLabel = ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;

  return (
    <div className="kedi-workspace">
      <Toaster position="top-center" richColors />
      <a className="workspace-skip" href="#workspace-content">Skip to content</a>
      <aside className="workspace-sidebar">
        <NavLink to="/" className="workspace-brand" aria-label="KEDI overview"><img src="/kedi-logo.png" alt="KEDI Healthcare" /><span>LOGISTICS WORKSPACE</span></NavLink>
        <p className="workspace-nav-label">WORKSPACE</p>
        <nav aria-label="Desktop navigation">
          {tabs.map(tab => <NavLink key={tab.path} to={tab.path} end={tab.path === "/"} className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}><tab.icon size={19} /><span>{tab.label}</span></NavLink>)}
          {canReport && <NavLink to="/reports" className={({ isActive }) => `workspace-nav-link ${isActive ? "active" : ""}`}><BarChart3 size={19} /><span>Reports</span></NavLink>}
        </nav>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-brand-note"><span>Every shipment,<br />a promise.</span><ArrowUpRight size={22} /></div>
          <NavLink to="/profile" className="workspace-person"><span className="workspace-avatar">{initials}</span><span><strong>{user?.name}</strong><small>{roleLabel}</small></span></NavLink>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <NavLink to="/" className="workspace-mobile-logo"><img src="/kedi-logo.png" alt="KEDI Healthcare" /></NavLink>
          <div className="workspace-breadcrumb">Workspace <span>/</span><strong>{title}</strong></div>
          <div className="workspace-header-actions"><span className="workspace-role">{roleLabel}</span><NavLink to="/notifications" className="workspace-notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}><Bell size={21} />{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</NavLink><NavLink to="/profile" className="workspace-avatar" aria-label="Your profile">{initials}</NavLink></div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="workspace-content"><Outlet /></main>
      </div>
      <nav className="workspace-mobile-nav" aria-label="Mobile navigation">{tabs.map(tab => <NavLink key={tab.path} to={tab.path} end={tab.path === "/"} className={({ isActive }) => isActive ? "active" : ""}><tab.icon size={21} /><span>{tab.label}</span></NavLink>)}</nav>
    </div>
  );
}
