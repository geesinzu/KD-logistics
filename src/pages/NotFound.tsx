import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4">
      <Package size={48} className="text-gray-300 mb-4" />
      <h1 className="text-2xl font-bold text-[#1E293B] mb-2">Page Not Found</h1>
      <p className="text-sm text-gray-500 mb-6">The page you are looking for does not exist.</p>
      <Button className="bg-[#003B7A] hover:bg-[#002B5A]" onClick={() => navigate("/")}>Go Home</Button>
    </div>
  );
}
