import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import TplLogin from "./pages/TplLogin";
import TplPortal from "./pages/TplPortal";
import Dashboard from "./pages/Dashboard";
import Shipments from "./pages/Shipments";
import ShipmentDetail from "./pages/ShipmentDetail";
import CreateShipment from "./pages/CreateShipment";
import WarehouseProcess from "./pages/WarehouseProcess";
import Assign3pl from "./pages/Assign3pl";
import DriverDeliveries from "./pages/DriverDeliveries";
import QrScanner from "./pages/QrScanner";
import Users from "./pages/Users";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import { AppLayout } from "./components/AppLayout";

function ProtectedRoute({ children, requiredRoles }: { children: React.ReactNode; requiredRoles?: string[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003B7A]" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.status === "pending") return <Navigate to="/pending" replace />;
  if (requiredRoles && !requiredRoles.includes(user?.role || "")) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/tpl-login" element={<TplLogin />} />

      {/* 3PL Portal - standalone layout */}
      <Route path="/tpl-portal" element={<TplPortal />} />

      {/* Not found */}
      <Route path="*" element={<NotFound />} />

      {/* KEDI App with bottom nav */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/shipments" element={<ProtectedRoute><Shipments /></ProtectedRoute>} />
        <Route path="/shipments/:id" element={<ProtectedRoute><ShipmentDetail /></ProtectedRoute>} />
        <Route path="/shipments/create" element={<ProtectedRoute requiredRoles={["super_admin","admin","shipment_creator"]}><CreateShipment /></ProtectedRoute>} />
        <Route path="/warehouse/:id" element={<ProtectedRoute requiredRoles={["super_admin","admin","warehouse_supply"]}><WarehouseProcess /></ProtectedRoute>} />
        <Route path="/assign-3pl/:id" element={<ProtectedRoute requiredRoles={["super_admin","admin","logistics_officer"]}><Assign3pl /></ProtectedRoute>} />
        <Route path="/driver/deliveries" element={<ProtectedRoute requiredRoles={["super_admin","admin","driver"]}><DriverDeliveries /></ProtectedRoute>} />
        <Route path="/scan" element={<ProtectedRoute><QrScanner /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute requiredRoles={["super_admin"]}><Users /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}
