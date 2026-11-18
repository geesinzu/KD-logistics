import { Printer, CheckCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PRINT_PARTS, concisePrint, fullPrint } from "@contracts/report-print";
import type { PrintSelection } from "@contracts/report-print";
export function ReportPrintOptions({
  open,
  setOpen,
  selection,
  setSelection,
  onPrint,
  lateCount,
  ready,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selection: PrintSelection;
  setSelection: (selection: PrintSelection) => void;
  onPrint: () => void;
  lateCount: number;
  ready: boolean;
}) {
  const count = PRINT_PARTS.filter(part => selection[part.key]).length;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="report-print-dialog"
        onOpenAutoFocus={event => {
          event.preventDefault();
          document.getElementById("report-print-title")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle id="report-print-title" tabIndex={-1}>
            Choose what to print
          </DialogTitle>
          <DialogDescription>
            Start with the key details, or choose the sections you need. Your
            on-screen report stays complete.
          </DialogDescription>
        </DialogHeader>
        <div className="report-print-presets">
          <Button
            variant="outline"
            onClick={() => setSelection(concisePrint())}
          >
            Key details
          </Button>
          <Button variant="outline" onClick={() => setSelection(fullPrint())}>
            <CheckCheck size={15} /> Full report
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setSelection({
                summary: false,
                late: false,
                branches: false,
                partners: false,
                followups: false,
                analysis: false,
                actions: false,
              })
            }
          >
            Clear selection
          </Button>
        </div>
        <fieldset className="report-print-choices">
          <legend className="sr-only">Report sections</legend>
          {PRINT_PARTS.map(part => (
            <label key={part.key}>
              <input
                type="checkbox"
                checked={selection[part.key]}
                onChange={e =>
                  setSelection({ ...selection, [part.key]: e.target.checked })
                }
              />
              <span>
                <strong>
                  {part.label}
                  {part.key === "late" && <small>{lateCount}</small>}
                </strong>
                <span>{part.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {!ready && (
          <p role="status" className="report-print-hint">
            Wait for the report to finish loading before printing.
          </p>
        )}
        <p className="report-print-hint">
          Selected dates, branch and 3PL filters apply. Printed tables include
          all matching rows, not just the current page. Branch-name search does
          not limit the printed branch table.
        </p>
        <div className="report-print-footer">
          <span aria-live="polite">
            {count} section{count === 1 ? "" : "s"} selected
          </span>
          <Button
            className="bg-navy"
            disabled={!count || !ready}
            onClick={onPrint}
          >
            <Printer size={16} /> Print selected sections
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
