import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, QrCode, FileText } from "lucide-react";
import { PrintLabel } from "@/components/PrintLabel";
import QRCode from "qrcode";

export default function WarehouseProcess() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [actualItemCount, setActualItemCount] = useState("");
  const [itemDetails, setItemDetails] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ trackingId: string; qrToken: string } | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!result?.qrToken) return;
    let cancelled = false;
    QRCode.toDataURL(result.qrToken, { width: 160, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(""); });
    return () => { cancelled = true; };
  }, [result?.qrToken]);

  const utils = trpc.useUtils();
  const { data: shipment } = trpc.shipment.getById.useQuery(
    { id: Number(id) },
    { refetchOnMount: true, staleTime: 0 }
  );

  const processMutation = trpc.shipment.warehouseProcess.useMutation({
    onSuccess: (data) => {
      setResult({ trackingId: data.trackingId, qrToken: data.qrToken });
      utils.shipment.list.invalidate();
      utils.shipment.getById.invalidate({ id: Number(id) });
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!actualItemCount || Number(actualItemCount) < 1) { setError("Item count required"); return; }
    if (!itemDetails.trim()) { setError("Item details required"); return; }
    if (!storageLocation.trim()) { setError("Storage location required"); return; }
    if (!weightKg || Number(weightKg) <= 0) { setError("Weight (kg) is required"); return; }
    processMutation.mutate({
      shipmentId: Number(id),
      actualItemCount: Number(actualItemCount),
      itemDetails,
      storageLocation,
      weightKg: Number(weightKg),
    });
  };

  if (!shipment) return <div className="p-4 text-center">Loading...</div>;

  // Show result after processing
  if (result) {
    if (showPrint) {
      return (
        <div className="max-w-lg mx-auto p-4">
          <PrintLabel
            trackingId={result.trackingId}
            qrToken={result.qrToken}
            destinationBranch={shipment.destinationBranch}
            receiverName={shipment.receiverName}
            actualItemCount={actualItemCount}
            weightKg={weightKg}
            itemDetails={itemDetails}
            onClose={() => setShowPrint(false)}
          />
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <QrCode size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-green-800 mb-1">Label Generated!</h2>
          <p className="text-sm text-green-700 mb-4">Print and attach to shipment</p>
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <p className="text-xs text-gray-500 mb-1">TRACKING ID</p>
              <p className="text-2xl font-bold text-[#003B7A] tracking-wider">{result.trackingId}</p>
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="mx-auto w-20 h-20" />
                ) : (
                  <QrCode size={80} className="mx-auto text-[#003B7A] animate-pulse" />
                )}
                <p className="text-[10px] text-gray-400 mt-1">QR Code for scanning</p>
              </div>
              <div className="mt-3 text-left text-xs space-y-1">
                <p><strong>To:</strong> {shipment.destinationBranch}</p>
                <p><strong>Items:</strong> {actualItemCount}</p>
                <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Print Label Button */}
          <Button className="mt-4 w-full h-12 bg-[#003B7A] hover:bg-[#002B5A]" onClick={() => setShowPrint(true)}>
            <FileText size={16} className="mr-2" /> Print Shipment Label
          </Button>

          <Button variant="outline" className="mt-2 w-full h-10" onClick={() => navigate("/shipments")}>
            Done - Back to Shipments
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Process Shipment</h1>
      </div>
      <div className="p-4">
        <Card className="border-0 shadow-sm mb-4 bg-yellow-50">
          <CardContent className="p-3">
            <p className="text-xs text-yellow-800">
              <strong>Destination:</strong> {shipment.destinationBranch}<br />
              {shipment.estimatedItemCount && <><strong>Estimated:</strong> {shipment.estimatedItemCount} items<br /></>}
              {shipment.receiverName && <><strong>Recipient:</strong> {shipment.receiverName}</>}
            </p>
          </CardContent>
        </Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Actual Item Count *</Label>
            <Input type="number" value={actualItemCount} onChange={e => setActualItemCount(e.target.value)} placeholder="e.g., 15" required />
          </div>
          <div>
            <Label>Item Details *</Label>
            <Textarea value={itemDetails} onChange={e => setItemDetails(e.target.value)} placeholder="15 cartons of KEDI health products, 3 boxes of supplements..." required />
          </div>
          <div>
            <Label>Storage Location *</Label>
            <Input value={storageLocation} onChange={e => setStorageLocation(e.target.value)} placeholder="Warehouse A, Shelf 12" required />
          </div>
          <div>
            <Label>Weight (kg) *</Label>
            <Input type="number" step="0.01" min="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="e.g., 12.5" required />
            <p className="text-[10px] text-gray-400 mt-0.5">Total shipment weight in kilograms</p>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <Button type="submit" className="w-full bg-[#003B7A] hover:bg-[#002B5A] h-12" disabled={processMutation.isPending}>
            <QrCode size={16} className="mr-2" /> {processMutation.isPending ? "Generating..." : "Generate Shipping Label"}
          </Button>
        </form>
      </div>
    </div>
  );
}
