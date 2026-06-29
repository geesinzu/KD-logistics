import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { ArrowLeft, QrCode, CheckCircle2, XCircle, Camera, CameraOff } from "lucide-react";

export default function QrScanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const { data: shipment, isLoading } = trpc.shipment.qrValidate.useQuery(
    { token: scanResult || "" },
    { enabled: !!scanResult }
  );

  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraReady(false);
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Camera not supported on this device. Use manual entry below.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      setScanning(true);
      scanFrame();
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraError("Camera access denied. On iPhone: Settings > Safari > Camera > Allow. Use manual entry below.");
      setScanning(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setScanning(false);
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Dynamic import of jsQR
    import("jsqr").then(({ default: jsQR }) => {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) {
        stopCamera();
        setScanResult(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    });
  }, [stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const handleManual = () => {
    if (manualInput.trim()) setScanResult(manualInput.trim());
  };

  const reset = () => {
    setScanResult(null);
    setManualInput("");
    setCameraError("");
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-[#0F172A] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => { stopCamera(); navigate(-1); }} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold">Scan QR Code</h1>
      </div>

      {!scanResult && (
        <div className="p-4">
          {/* Camera view */}
          <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-[4/3] mb-4">
            {scanning && cameraReady ? (
              <>
                <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
                <canvas ref={canvasRef} className="hidden" />
                {/* Scan overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#003B7A] rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#003B7A] rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#003B7A] rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#003B7A] rounded-br-lg" />
                  </div>
                  <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">Align QR code within frame</p>
                </div>
                <button onClick={stopCamera} className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white">
                  <CameraOff size={16} />
                </button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                <QrCode size={48} className="text-white/30 mb-3" />
                {cameraError ? (
                  <p className="text-red-400 text-xs text-center mb-3">{cameraError}</p>
                ) : (
                  <p className="text-white/50 text-xs text-center mb-3">Tap below to open camera and scan QR code</p>
                )}
                <Button className="bg-[#003B7A] hover:bg-[#002B5A]" onClick={startCamera}>
                  <Camera size={16} className="mr-2" /> Open Camera
                </Button>
              </div>
            )}
          </div>

          {/* Manual entry - always visible as fallback */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-2 text-center font-medium">Or enter tracking ID manually</p>
            <div className="flex gap-2">
              <input value={manualInput} onChange={e => setManualInput(e.target.value)}
                placeholder="Enter tracking ID or QR token"
                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm"
                onKeyDown={e => e.key === "Enter" && handleManual()} />
              <Button size="sm" className="bg-[#003B7A] h-10 px-4" onClick={handleManual}>Go</Button>
            </div>
          </div>
        </div>
      )}

      {/* Scan Result */}
      {scanResult && (
        <div className="p-4">
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003B7A] mx-auto mb-3" />
              <p className="text-sm text-gray-400">Validating...</p>
            </div>
          )}
          {!shipment && !isLoading && (
            <div className="text-center py-8">
              <XCircle size={48} className="mx-auto text-red-400 mb-3" />
              <p className="text-lg font-semibold text-red-600">Invalid QR Code</p>
              <p className="text-sm text-gray-500 mb-4">No shipment found for: {scanResult}</p>
              <Button variant="outline" onClick={reset}>Scan Again</Button>
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
                <Button variant="outline" onClick={reset}>Scan Again</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
