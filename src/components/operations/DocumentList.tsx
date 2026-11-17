import { useState } from "react";
import { Link } from "react-router";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { DOCUMENT_LABELS } from "@contracts/operations";
import type { DOCUMENT_KINDS } from "@contracts/operations";
import {
  operationDate,
  fileSize,
  downloadPrivateFile,
} from "@/lib/operationFiles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
export type DocumentRow = {
  id: number;
  parentId: number;
  name: string;
  mime: string;
  size: number;
  kind: string;
  uploaderName: string;
  createdAt: Date | string;
  removedAt: Date | string | null;
  removalReason: string | null;
  trackingId?: string | null;
};
export function DocumentList({ files }: { files: DocumentRow[] }) {
  const { isSuperAdmin } = useAuth();
  const [removing, setRemoving] = useState<DocumentRow | null>(null);
  const [reason, setReason] = useState("");
  const [downloading, setDownloading] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const remove = trpc.operations.removeDocument.useMutation({
    retry: false,
    onSuccess: async () => {
      setRemoving(null);
      await utils.operations.invalidate();
      toast.success("Document removed. Its removal record is kept.");
    },
    onError: error => toast.error(error.message),
  });
  return (
    <>
      <div className="ops-document-list">
        {files.map(file => (
          <article
            key={file.id}
            className={`ops-document-row ${file.removedAt ? "ops-retired" : ""}`}
          >
            <div className="ops-file-icon">
              {file.mime === "application/pdf" ? (
                <FileText size={25} />
              ) : (
                <ImageIcon size={25} />
              )}
            </div>
            <div className="ops-document-info">
              <strong>{file.name}</strong>
              <div>
                <span className="ops-tag">
                  {DOCUMENT_LABELS[
                    file.kind as (typeof DOCUMENT_KINDS)[number]
                  ] ?? file.kind}
                </span>
                {file.trackingId && (
                  <Link to={`/shipments/${file.parentId}`}>
                    {file.trackingId}
                  </Link>
                )}
                <span>{fileSize(file.size)}</span>
              </div>
              <p>
                {file.removedAt
                  ? `Removed · ${file.removalReason}`
                  : `${file.uploaderName} · ${operationDate(file.createdAt)}`}
              </p>
            </div>
            {!file.removedAt && (
              <div className="ops-file-actions">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloading === file.id}
                  aria-label={`Download ${file.name}`}
                  onClick={async () => {
                    setDownloading(file.id);
                    try {
                      await downloadPrivateFile(file.id, file.name);
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setDownloading(null);
                    }
                  }}
                >
                  <Download size={15} />
                  <span className="ops-download-label">
                    {downloading === file.id ? "Downloading…" : "Download"}
                  </span>
                </Button>
                {isSuperAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => {
                      setRemoving(file);
                      setReason("");
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="ops-private-note">
        <ShieldCheck size={14} /> Private to authorised KEDI staff
      </p>
      <Dialog
        open={!!removing}
        onOpenChange={open => {
          if (!open && !remove.isPending) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove document</DialogTitle>
            <DialogDescription>
              The file will no longer be downloadable. Its name and removal
              reason remain in the record.
            </DialogDescription>
          </DialogHeader>
          <form
            className="ops-form"
            onSubmit={e => {
              e.preventDefault();
              if (removing) remove.mutate({ id: removing.id, reason });
            }}
          >
            <p>{removing?.name}</p>
            <Label htmlFor="document-removal-reason">Reason for removal</Label>
            <Textarea
              id="document-removal-reason"
              minLength={5}
              maxLength={1000}
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <Button
              type="submit"
              variant="destructive"
              disabled={remove.isPending || reason.trim().length < 5}
            >
              {remove.isPending ? "Removing…" : "Remove document"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
