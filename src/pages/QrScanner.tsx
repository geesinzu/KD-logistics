import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@contracts/constants";
import { ArrowLeft, QrCode, CheckCircle2, XCircle, Camera, CameraOff, Upload } from "lucide-react";

export default function QrScanner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const action = searchParams.get("action"); // "pickup", "dropoff", or null (just view)

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const scanCountRef = useRef(0);

  const { data: shipment, isLoading } = trpc.shipment.qrValidate.useQuery(
    { token: scanResult || "" },
    { enabled: !!scanResult }
  );

  const pickupMutation = trpc.shipment.driverPickup.useMutation({
    onSuccess: () => {
      utils.shipment.list.invalidate();
      utils.shipment.getById.invalidate({ id: shipment?.id });
      alert("Pickup confirmed!");
      navigate("/driver/deliveries");
    },
    onError: (err: any) => alert(err.message),
  });

  const dropoffMutation = trpc.shipment.driverDropAt3pl.useMutation({
    onSuccess: () => {
      utils.shipment.list.invalidate();
      utils.shipment.getById.invalidate({ id: shipment?.id });
      alert("Drop-off confirmed!");
      navigate("/driver/deliveries");
    },
    onError: (err: any) => alert(err.message),
  });

  const utils = trpc.useUtils();

  // Decode image data using jsQR
  const decodeWithJsQR = useCallback(async (imageData: ImageData): Promise<string | null> => {
    try {
      const { default: jsQR } = await import("jsqr");
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      return code?.data || null;
    } catch {
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setScanning(false);
    setCameraReady(false);
  }, []);

  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Ensure video is ready
    if (video.readyState < video.HAVE_CURRENT_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Limit scan rate to every 5 frames for performance
    scanCountRef.current++;
    if (scanCountRef.current % 5 !== 0) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    try {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = await decodeWithJsQR(imageData);
      if (result) {
        stopCamera();
        setScanResult(result);
        return;
      }
    } catch {
      // Frame processing error, continue scanning
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [stopCamera, decodeWithJsQR]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraReady(false);
    setScanning(true);
    scanCountRef.current = 0;

    // Check if mediaDevices is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera not supported. Use manual entry or upload QR image.");
      setScanning(false);
      return;
    }

    try {
      // Try with ideal constraints first
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback: any video
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("autoplay", "true");
        videoRef.current.muted = true;

        await videoRef.current.play();
        setCameraReady(true);
        setScanning(true);
        scanFrame();
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings, or use manual entry below."
        : err.name === "NotFoundError"
        ? "No camera found on this device. Use manual entry below."
        : "Camera error. Use manual entry or upload QR image.";
      setCameraError(msg);
      setScanning(false);
    }
  }, [scanFrame]);

  // Handle file upload for QR image
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = await decodeWithJsQR(imageData);
        if (result) {
          setScanResult(result);
        } else {
          alert("No QR code found in image. Try again or use manual entry.");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [decodeWithJsQR]);

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
    stopCamera();
  };

  // Perform action after scan
  const handleAction = (actionType: string) => {
    if (!shipment) return;
    if (actionType === "pickup") {
      pickupMutation.mutate({
        shipmentId: shipment.id,
        qtyMatch: true,
        notes: "Picked up via QR scan",
      });
    } else if (actionType === "dropoff") {
      dropoffMutation.mutate({
        shipmentId: shipment.id,
        tplRepName: "Auto-confirmed via scan",
      });
    }
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
            {/* video/canvas stay mounted at all times so their refs exist before
                startCamera() runs — they were previously only rendered once
                scanning && cameraReady were true, which meant the ref was always
                null at the moment the camera stream needed to be attached. */}
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
                scanning && cameraReady ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />

            {scanning && cameraReady ? (
              <>
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
                <button onClick={stopCamera} className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white z-10">
                  <CameraOff size={16} />
                </button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                {cameraError ? (
                  <>
                    <QrCode size={48} className="text-white/30 mb-3" />
                    <p className="text-red-400 text-xs text-center mb-3">{cameraError}</p>
                  </>
                ) : scanning ? (
                  <>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60 mb-3" />
                    <p className="text-white/50 text-xs text-center mb-3">Starting camera&hellip;</p>
                  </>
                ) : (
                  <>
                    <QrCode size={48} className="text-white/30 mb-3" />
                    <p className="text-white/50 text-xs text-center mb-3">Tap to scan QR code with camera</p>
                  </>
                )}
                <Button className="bg-[#003B7A] hover:bg-[#002B5A]" onClick={startCamera} disabled={scanning && !cameraError}>
                  <Camera size={16} className="mr-2" /> Open Camera
                </Button>
              </div>
            )}
          </div>

          {/* Upload QR image */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 text-sm text-[#003B7A] bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Upload size={16} /> Upload QR Code Image
          </button>

          {/* Manual entry - always visible */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-2 text-center font-medium">Or enter tracking ID manually</p>
            <div className="flex gap-2">
              <input
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder="Enter tracking ID (e.g., KEDI-EN2606506)"
                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm"
                onKeyDown={e => e.key === "Enter" && handleManual()}
              />
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
                    <Badge className={`text-xs ${STATUS_COLORS[shipment.status as keyof typeof STATUS_COLORS] || ""}`}>
                      {STATUS_LABELS[shipment.status as keyof typeof STATUS_LABELS] || shipment.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">To: {shipment.destinationBranch}</p>
                  <p className="text-sm text-gray-600">Items: {shipment.actualItemCount || 0}</p>
                  {shipment.itemDetails && <p className="text-xs text-gray-500 mt-1">{shipment.itemDetails}</p>}
                </CardContent>
              </Card>

              {/* Action buttons based on context */}
              <div className="space-y-2">
                {action === "pickup" && (
                  <Button
                    className="w-full h-12 bg-green-600 hover:bg-green-700"
                    disabled={pickupMutation.isPending}
                    onClick={() => handleAction("pickup")}
                  >
                    {pickupMutation.isPending ? "Confirming..." : "Confirm Pickup"}
                  </Button>
                )}
                {action === "dropoff" && (
                  <Button
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700"
                    disabled={dropoffMutation.isPending}
                    onClick={() => handleAction("dropoff")}
                  >
                    {dropoffMutation.isPending ? "Confirming..." : "Confirm Drop-off at 3PL"}
                  </Button>
                )}
                <Button className="w-full bg-[#003B7A] hover:bg-[#002B5A]" onClick={() => navigate(`/shipments/${shipment.id}`)}>
                  View Full Details
                </Button>
                <Button variant="outline" className="w-full" onClick={reset}>
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
