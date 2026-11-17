import type { UploadInput } from "@contracts/operations";
import { MAX_FILE_BYTES, MAX_PHOTO_BYTES } from "@contracts/operations";
import { resizeImage } from "./resizeImage";
export function operationDate(value: Date | string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
export function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export async function prepareUpload(
  file: File,
  photoOnly: boolean
): Promise<UploadInput> {
  const inferred =
    file.type ||
    ({
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    }[file.name.split(".").pop()?.toLowerCase() ?? ""] ??
      "");
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      inferred
    ) ||
    (photoOnly && inferred === "application/pdf")
  )
    throw Error(
      photoOnly
        ? "Choose a JPG, PNG or WEBP photo."
        : "Choose a PDF, JPG, PNG or WEBP document."
    );
  let encoded: string;
  if (photoOnly && file.size > MAX_PHOTO_BYTES)
    encoded = await resizeImage(file, 1800, 1800);
  else {
    if (file.size > MAX_FILE_BYTES)
      throw Error("Each document must be 5 MB or smaller.");
    encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(Error("The file could not be read. Please select it again."));
      reader.readAsDataURL(file);
    });
  }
  const base64 = encoded.split(",")[1];
  const mime = encoded.slice(5, encoded.indexOf(";"));
  const decodedSize =
    (base64.length / 4) * 3 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (decodedSize > (photoOnly ? MAX_PHOTO_BYTES : MAX_FILE_BYTES))
    throw Error(
      photoOnly
        ? "Choose a smaller photo (up to 3 MB)."
        : "Choose a smaller document (up to 5 MB)."
    );
  return {
    name: file.name,
    mime: ([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(mime)
      ? mime
      : inferred) as UploadInput["mime"],
    base64,
  };
}
export async function privateFileBlob(id: number, signal?: AbortSignal) {
  const token = localStorage.getItem("kedi_token");
  const response = await fetch(`/api/files/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw Error(
      response.status === 401
        ? "Please sign in again to access this file."
        : response.status === 403
          ? "This file is outside your branch or shipment access."
          : "This file is unavailable. Refresh and try again."
    );
  return response.blob();
}
export async function downloadPrivateFile(id: number, name: string) {
  const blob = await privateFileBlob(id),
    url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
