import { useState } from "react";
import { Link } from "react-router";
import { Paperclip, Plus, FolderOpen } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DOCUMENT_KINDS, DOCUMENT_LABELS } from "@contracts/operations";
import type { UploadInput } from "@contracts/operations";
import { OperationsGate } from "./OperationsGate";
import { DocumentList } from "./DocumentList";
import { FilePicker } from "./FilePicker";
import { toast } from "sonner";
function Documents({ shipmentId }: { shipmentId: number }) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<(typeof DOCUMENT_KINDS)[number]>("waybill");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const documents = trpc.operations.documents.useQuery({ shipmentId });
  const utils = trpc.useUtils();
  const upload = trpc.operations.uploadDocument.useMutation({
    retry: false,
    onSuccess: async () => {
      setOpen(false);
      setFiles([]);
      setKey(crypto.randomUUID());
      await utils.operations.invalidate();
      toast.success("Document attached to this shipment.");
    },
    onError: error => {
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") {
        setOpen(false);
        void utils.operations.invalidate();
      }
    },
  });
  return (
    <>
      <div className="ops-section-heading">
        <div>
          <span className="ops-eyebrow">SHIPMENT RECORDS</span>
          <h2>
            <Paperclip size={19} /> Documents{" "}
            <span>{documents.data?.filter(f => !f.removedAt).length ?? 0}</span>
          </h2>
        </div>
        {role !== "viewer" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFiles([]);
              setKey(crypto.randomUUID());
              setOpen(true);
            }}
          >
            <Plus size={15} /> Attach document
          </Button>
        )}
      </div>
      {documents.isLoading ? (
        <p role="status" className="ops-muted">
          Loading documents…
        </p>
      ) : documents.error ? (
        <div role="alert">
          Could not load documents.{" "}
          <Button variant="link" onClick={() => void documents.refetch()}>
            Retry
          </Button>
        </div>
      ) : !documents.data?.length ? (
        <div className="ops-empty ops-empty-small">
          <FolderOpen size={29} />
          <strong>Keep the paperwork with the shipment</strong>
          <p>Add waybills, delivery notes, invoices and packing lists.</p>
        </div>
      ) : (
        <DocumentList files={documents.data} />
      )}
      <Link className="ops-text-link" to="/documents">
        Open document library →
      </Link>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!upload.isPending && !busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach shipment document</DialogTitle>
            <DialogDescription>
              Keep the original paperwork together. Files are private to
              authorised KEDI staff.
            </DialogDescription>
          </DialogHeader>
          <form
            className="ops-form"
            onSubmit={e => {
              e.preventDefault();
              if (files[0] && !busy)
                upload.mutate({
                  shipmentId,
                  kind,
                  file: files[0],
                  clientKey: key,
                });
            }}
          >
            <div>
              <Label htmlFor="document-type">Document type</Label>
              <select
                id="document-type"
                className="ops-select"
                value={kind}
                onChange={e => setKind(e.target.value as typeof kind)}
              >
                {DOCUMENT_KINDS.map(k => (
                  <option key={k} value={k}>
                    {DOCUMENT_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <FilePicker
              files={files}
              onChange={setFiles}
              onBusyChange={setBusy}
              disabled={upload.isPending}
            />
            <Button
              className="bg-navy"
              type="submit"
              disabled={files.length !== 1 || busy || upload.isPending}
            >
              {upload.isPending ? "Attaching…" : "Attach document"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ShipmentDocuments({ shipmentId }: { shipmentId: number }) {
  return (
    <section className="ops-panel ops-shipment-documents">
      <OperationsGate>
        <Documents shipmentId={shipmentId} />
      </OperationsGate>
    </section>
  );
}
