import { useEffect, useRef, useState } from "react";
import { Download, ImageOff, Loader2 } from "lucide-react";
import { privateFileBlob, downloadPrivateFile } from "@/lib/operationFiles";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function PrivatePhoto({
  file,
}: {
  file: { id: number; name: string; uploaderName: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "",
      mounted = true;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        void privateFileBlob(file.id, controller.signal)
          .then(blob => {
            if (!mounted) return;
            objectUrl = URL.createObjectURL(blob);
            setUrl(objectUrl);
          })
          .catch(error => {
            if (error.name !== "AbortError" && mounted) setFailed(true);
          });
      },
      { rootMargin: "100px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      mounted = false;
      observer.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id]);
  return (
    <div ref={ref} className="ops-private-photo">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${file.name}`}
        disabled={!url}
      >
        {url ? (
          <img
            src={url}
            alt={`Item evidence from ${file.uploaderName}`}
            loading="lazy"
          />
        ) : failed ? (
          <ImageOff size={24} />
        ) : (
          <Loader2 className="animate-spin" size={22} />
        )}
      </button>
      <div>
        <span title={file.name}>{file.name}</span>
        <button
          type="button"
          aria-label={`Download ${file.name}`}
          onClick={() =>
            void downloadPrivateFile(file.id, file.name).catch(e =>
              toast.error(e.message)
            )
          }
        >
          <Download size={15} />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="ops-photo-dialog">
          <DialogTitle>{file.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Item photo evidence from {file.uploaderName}.
          </DialogDescription>
          {url && (
            <img src={url} alt={`Item evidence from ${file.uploaderName}`} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
