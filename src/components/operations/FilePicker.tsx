import { useId, useState } from "react";
import { UploadCloud, X, FileText, Image as ImageIcon } from "lucide-react";
import type { UploadInput } from "@contracts/operations";
import { prepareUpload } from "@/lib/operationFiles";
import { toast } from "sonner";
export function FilePicker({
  files,
  onChange,
  photos = false,
  disabled = false,
  onBusyChange,
}: {
  files: UploadInput[];
  onChange: (files: UploadInput[]) => void;
  photos?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const max = photos ? 5 : 1;
  return (
    <div className="ops-file-picker">
      <label
        htmlFor={id}
        className={`ops-drop ${disabled || busy ? "ops-disabled" : ""}`}
      >
        <UploadCloud size={24} />
        <strong>
          {busy
            ? "Preparing files…"
            : photos
              ? "Add item photos"
              : "Choose a document"}
        </strong>
        <span>
          {photos
            ? "JPG, PNG or WEBP · up to 5 photos"
            : "PDF, JPG, PNG or WEBP · up to 5 MB"}
        </span>
        <input
          id={id}
          aria-label={photos ? "Item photos" : "Document file"}
          type="file"
          accept={
            photos
              ? "image/jpeg,image/png,image/webp"
              : "application/pdf,image/jpeg,image/png,image/webp"
          }
          multiple={photos}
          disabled={disabled || busy}
          onChange={async e => {
            const selected = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!selected.length) return;
            if (selected.length + files.length > max && photos) {
              toast.error("Add up to 5 photos per update.");
              return;
            }
            setBusy(true);
            onBusyChange?.(true);
            try {
              const next = await Promise.all(
                selected.map(file => prepareUpload(file, photos))
              );
              onChange(photos ? [...files, ...next] : next);
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setBusy(false);
              onBusyChange?.(false);
            }
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="ops-selected-files">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="ops-selected-file">
              {photos ? (
                <img
                  src={`data:${file.mime};base64,${file.base64}`}
                  alt={`Selected item photo ${index + 1}`}
                />
              ) : file.mime === "application/pdf" ? (
                <FileText size={22} />
              ) : (
                <ImageIcon size={22} />
              )}
              <span>{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={disabled || busy}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
