import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

interface PrintLabelProps {
  trackingId: string;
  destinationBranch: string;
  receiverName?: string | null;
  actualItemCount: string | number;
  weightKg?: string | number | null;
  itemDetails?: string;
  date?: string;
  onClose?: () => void;
}

export function PrintLabel({
  trackingId,
  destinationBranch,
  receiverName,
  actualItemCount,
  weightKg,
  itemDetails,
  date = new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }),
  onClose,
}: PrintLabelProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shipment Label - ${trackingId}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: white; color: #1E293B; }
          .label-container { max-width: 210mm; margin: 0 auto; padding: 24px; }
          .header { display: flex; align-items: center; gap: 20px; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 4px solid #003B7A; }
          .logo-box { width: 64px; height: 64px; background: #003B7A; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 28px; }
          .header-text h1 { font-size: 28px; font-weight: 900; color: #003B7A; letter-spacing: -0.5px; }
          .header-text p { font-size: 14px; color: #64748B; margin-top: 4px; font-weight: 600; }
          .tracking-section { background: #F1F5F9; border-radius: 10px; padding: 20px; margin-bottom: 24px; text-align: center; }
          .tracking-label { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #64748B; margin-bottom: 6px; font-weight: 700; }
          .tracking-id { font-size: 42px; font-weight: 900; color: #003B7A; letter-spacing: 6px; font-family: 'Courier New', monospace; }
          .barcode { margin: 10px auto; width: 320px; height: 70px; background: repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 5px, #fff 5px, #fff 8px); }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 24px; }
          .detail-box { border: 2px solid #E2E8F0; border-radius: 8px; padding: 14px; }
          .detail-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94A3B8; margin-bottom: 6px; font-weight: 700; }
          .detail-value { font-size: 18px; font-weight: 800; color: #1E293B; }
          .items-box { border: 2px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 24px; }
          .items-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94A3B8; margin-bottom: 6px; font-weight: 700; }
          .items-value { font-size: 15px; color: #334155; line-height: 1.6; font-weight: 600; }
          .signature-section { margin-top: 28px; }
          .sig-title { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #64748B; margin-bottom: 14px; font-weight: 800; }
          .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .sig-box { border: 2px solid #CBD5E1; border-radius: 8px; padding: 20px; }
          .sig-header { font-size: 14px; font-weight: 800; color: #003B7A; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #E2E8F0; }
          .sig-field { margin-bottom: 20px; }
          .sig-field-label { font-size: 12px; color: #94A3B8; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
          .sig-line { border-bottom: 2px solid #94A3B8; height: 36px; }
          .footer { margin-top: 28px; padding-top: 14px; border-top: 2px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8; font-weight: 600; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${content.innerHTML}
        <script>window.onload = () => { setTimeout(() => { window.print(); }, 300); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div>
      {/* Print button */}
      <div className="flex gap-2 mb-4">
        <Button className="flex-1 h-12 bg-[#003B7A] hover:bg-[#002B5A]" onClick={handlePrint}>
          <Printer size={16} className="mr-2" /> Print Label
        </Button>
        {onClose && (
          <Button variant="outline" className="h-12 px-4" onClick={onClose}>
            <X size={16} />
          </Button>
        )}
      </div>

      {/* Hidden print content */}
      <div ref={printRef} className="label-container">
        <div className="header">
          <div className="logo-box">K</div>
          <div className="header-text">
            <h1>KEDI Healthcare Logistics</h1>
            <p>Shipment Label &amp; Acknowledgement</p>
          </div>
        </div>

        <div className="tracking-section">
          <div className="tracking-label">Tracking Number</div>
          <div className="tracking-id">{trackingId}</div>
          <div className="barcode"></div>
        </div>

        <div className="details-grid">
          <div className="detail-box">
            <div className="detail-label">From (Origin)</div>
            <div className="detail-value">Lagos HQ Warehouse</div>
          </div>
          <div className="detail-box">
            <div className="detail-label">To (Destination)</div>
            <div className="detail-value">{destinationBranch}</div>
          </div>
          <div className="detail-box">
            <div className="detail-label">Item Count</div>
            <div className="detail-value">{actualItemCount} items</div>
          </div>
          {weightKg && (
            <div className="detail-box">
              <div className="detail-label">Weight</div>
              <div className="detail-value">{weightKg} kg</div>
            </div>
          )}
          <div className="detail-box">
            <div className="detail-label">Date</div>
            <div className="detail-value">{date}</div>
          </div>
        </div>

        {itemDetails && (
          <div className="items-box">
            <div className="items-label">Item Details</div>
            <div className="items-value">{itemDetails}</div>
          </div>
        )}

        {receiverName && (
          <div className="items-box">
            <div className="items-label">Recipient</div>
            <div className="items-value">{receiverName}</div>
          </div>
        )}

        <div className="signature-section">
          <div className="sig-title">Acknowledgement &amp; Signature</div>
          <div className="sig-grid">
            <div className="sig-box">
              <div className="sig-header">Released by Warehouse</div>
              <div className="sig-field">
                <div className="sig-field-label">Signature</div>
                <div className="sig-line"></div>
              </div>
              <div className="sig-field">
                <div className="sig-field-label">Full Name</div>
                <div className="sig-line"></div>
              </div>
              <div className="sig-field">
                <div className="sig-field-label">Date &amp; Time</div>
                <div className="sig-line"></div>
              </div>
            </div>

            <div className="sig-box">
              <div className="sig-header">Received by 3PL</div>
              <div className="sig-field">
                <div className="sig-field-label">Signature</div>
                <div className="sig-line"></div>
              </div>
              <div className="sig-field">
                <div className="sig-field-label">Full Name</div>
                <div className="sig-line"></div>
              </div>
              <div className="sig-field">
                <div className="sig-field-label">Date &amp; Time</div>
                <div className="sig-line"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="footer">
          KEDI Healthcare Logistics &bull; This label must accompany the shipment at all times.
          <br />
          Scan QR code or visit portal to track: https://kedi-logistics.com
        </div>
      </div>
    </div>
  );
}
