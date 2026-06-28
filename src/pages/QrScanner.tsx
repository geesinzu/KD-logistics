import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { ArrowLeft, QrCode, CheckCircle2, XCircle } from "lucide-react";

export default function QrScanner() {
  const navigate = useNavigate();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [showManual, setShowManual] = useState(false);

  const { data: shipment, isLoading } = trpc.shipment.qrValidate.useQuery(
    { token: scanResult || "" },
    { enabled: !!scanResult }
  );

  const handleScan = () => {
    // Simulate QR scan - in real implementation this would use camera + jsQR
    setScanResult("demo_qr_token");
  };

  const handleManual = () => {
    if (manualInput.trim()) {
      setScanResult(manualInput.trim());
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Scan QR Code</h1>
      </div>

      {!scanResult && (
        <div className="p-4">
          {/* Camera placeholder */}
          <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-square mb-4 flex flex-col items-center justify-center">
            <div className="absolute inset-0 border-[3px] border-white/20 rounded-xl" />
            <div className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#003B7A] rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#003B7A] rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#003B7A] rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#003B7A] rounded-br-lg" />
            </div>
            <QrCode size={64} className="text-white/30 mb-4" />
            <p className="text-white/60 text-sm">Align QR code within frame</p>
            <Button className="mt-4 bg-[#003B7A] hover:bg-[#002B5A]" onClick={handleScan}>Simulate Scan</Button>
          </div>

          {/* Manual entry */}
          <div className="text-center">
            <button onClick={() => setShowManual(!showManual)} className="text-sm text-[#003B7A] hover:underline">
              Enter tracking ID manually
            </button>
            {showManual && (
              <div className="mt-3 flex gap-2">
                <input value={manualInput} onChange={e => setManualInput(e.target.value)}
                  placeholder="Enter QR token or tracking ID"
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm" />
                <Button size="sm" className="bg-[#003B7A]" onClick={handleManual}>Go</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan Result */}
      {scanResult && (
        <div className="p-4">
          {isLoading && <p className="text-center py-4 text-gray-400">Validating...</p>}
          {!shipment && !isLoading && (
            <div className="text-center py-8">
              <XCircle size={48} className="mx-auto text-red-400 mb-3" />
              <p className="text-lg font-semibold text-red-600">Invalid QR Code</p>
              <p className="text-sm text-gray-500 mb-4">This QR code is not recognized</p>
              <Button variant="outline" onClick={() => { setScanResult(null); setManualInput(""); }}>Scan Again</Button>
            </div>
          )}
          {shipment && (
            <div>
              <div className="text-center mb-4">
                <CheckCircle2 size={48} className="mx-auto text-green-500 mb-2" />
                <p className="text-lg font-semibold text-green-700">Shipment Found!</p>
              </div>
              <Card className="border-0 shadow-sm mb-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl font-bold text-[#003B7A]">{shipment.trackingId}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[shipment.status] || ""}`}>{STATUS_LABELS[shipment.status]}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">To: {shipment.destinationBranch}</p>
                  <p className="text-sm text-gray-600">Items: {shipment.actualItemCount || 0}</p>
                  {shipment.itemDetails && <p className="text-xs text-gray-500 mt-1">{shipment.itemDetails}</p>}
                </CardContent>
              </Card>
              <div className="flex gap-2">
                <Button className="flex-1 bg-[#003B7A] hover:bg-[#002B5A]" onClick={() => navigate(`/shipments/${shipment.id}`)}>
                  View Details
                </Button>
                <Button variant="outline" onClick={() => { setScanResult(null); setManualInput(""); }}>
                  Scan Again
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
