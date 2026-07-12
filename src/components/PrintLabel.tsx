import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

interface PrintLabelProps {
  trackingId: string;
  destinationBranch: string;
  receiverName?: string | null;
  actualItemCount: string | number;
  itemDetails?: string;
  date?: string;
  onClose?: () => void;
}

export function PrintLabel({
  trackingId,
  destinationBranch,
  receiverName,
  actualItemCount,
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
          @page { size: A4 portrait; margin: 15mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: white; color: #1E293B; }
          .label-container { max-width: 210mm; margin: 0 auto; padding: 20px; }
          .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #003B7A; }
          .logo-box { width: 56px; height: 56px; background: #003B7A; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; }
          .header-text h1 { font-size: 22px; font-weight: 800; color: #003B7A; letter-spacing: -0.5px; }
          .header-text p { font-size: 11px; color: #64748B; margin-top: 2px; }
          .tracking-section { background: #F1F5F9; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center; }
          .tracking-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748B; margin-bottom: 4px; }
          .tracking-id { font-size: 32px; font-weight: 800; color: #003B7A; letter-spacing: 4px; font-family: 'Courier New', monospace; }
          .barcode { margin: 8px auto; width: 280px; height: 60px; background: repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 5px, #fff 5px, #fff 8px); }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
          .detail-box { border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px; }
          .detail-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #94A3B8; margin-bottom: 4px; }
          .detail-value { font-size: 14px; font-weight: 600; color: #1E293B; }
          .items-box { border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px; margin-bottom: 20px; }
          .items-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #94A3B8; margin-bottom: 4px; }
          .items-value { font-size: 12px; color: #334155; line-height: 1.5; }
          .signature-section { margin-top: 24px; }
          .sig-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748B; margin-bottom: 12px; font-weight: 600; }
          .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .sig-box { border: 1px solid #CBD5E1; border-radius: 6px; padding: 16px; }
          .sig-header { font-size: 11px; font-weight: 700; color: #003B7A; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #E2E8F0; }
          .sig-field { margin-bottom: 16px; }
          .sig-field-label { font-size: 9px; color: #94A3B8; text-transform: uppercase; margin-bottom: 4px; }
          .sig-line { border-bottom: 1px solid #94A3B8; height: 28px; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 9px; color: #94A3B8; }
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
