import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { operationFiles } from "@db/schema";
import type { User } from "@db/schema";
import type { getDb } from "../queries/connection";
import {
  MAX_FILE_BYTES,
  MAX_PHOTO_BYTES,
  MAX_PARENT_BYTES,
  MAX_PARENT_FILES,
} from "@contracts/operations";
import type { UploadInput } from "@contracts/operations";
type Db = ReturnType<typeof getDb>;
export type FileTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export function decodeUpload(file: UploadInput, photoOnly = false) {
  const bad = (message: string): never => {
    throw new TRPCError({ code: "BAD_REQUEST", message });
  };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64) || file.base64.length % 4)
    bad("The file encoding is invalid. Select the file again.");
  const bytes = Buffer.from(file.base64, "base64");
  if (
    !bytes.length ||
    bytes.length > (photoOnly ? MAX_PHOTO_BYTES : MAX_FILE_BYTES)
  )
    bad(
      photoOnly
        ? "Each transfer photo must be 3 MB or smaller."
        : "Each document must be 5 MB or smaller."
    );
  const detected =
    bytes.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : bytes.length > 3 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes[2] === 255
        ? "image/jpeg"
        : bytes.length > 8 &&
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : bytes.length > 12 &&
              bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP"
            ? "image/webp"
            : null;
  if (
    !detected ||
    detected !== file.mime ||
    (photoOnly && detected === "application/pdf")
  )
    bad(
      "Select a genuine PDF, JPG, PNG or WEBP file. Transfer evidence must be a photo."
    );
  const extension =
    detected === "application/pdf"
      ? ".pdf"
      : detected === "image/jpeg"
        ? ".jpg"
        : detected === "image/png"
          ? ".png"
          : ".webp";
  const clean =
    file.name
      .replace(/[\\/]/g, "_")
      .split("")
      .map(char =>
        char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? "_" : char
      )
      .join("")
      .replace(/\.[^.]+$/, "")
      .slice(0, 150)
      .trim() || "document";
  return {
    name: clean + extension,
    mime: detected!,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    content: bytes,
  };
}
export const fileMetadata = {
  id: operationFiles.id,
  parentType: operationFiles.parentType,
  parentId: operationFiles.parentId,
  stage: operationFiles.stage,
  kind: operationFiles.kind,
  eventId: operationFiles.eventId,
  name: operationFiles.name,
  mime: operationFiles.mime,
  size: operationFiles.size,
  uploaderName: operationFiles.uploaderName,
  uploadedBy: operationFiles.uploadedBy,
  createdAt: operationFiles.createdAt,
  removedAt: operationFiles.removedAt,
  removalReason: operationFiles.removalReason,
};
export async function saveFiles(
  tx: FileTx,
  parentType: "shipment" | "transfer",
  parentId: number,
  stage: string,
  kind: string,
  files: ReturnType<typeof decodeUpload>[],
  actor: User,
  eventId?: number,
  clientKey?: string
) {
  const [usage] = await tx
    .select({
      count: sql<number>`count(*)`,
      size: sql<number>`coalesce(sum(${operationFiles.size}),0)`,
    })
    .from(operationFiles)
    .where(
      and(
        eq(operationFiles.parentType, parentType),
        eq(operationFiles.parentId, parentId),
        isNull(operationFiles.removedAt)
      )
    );
  if (
    Number(usage.count) + files.length > MAX_PARENT_FILES ||
    Number(usage.size) + files.reduce((sum, f) => sum + f.size, 0) >
      MAX_PARENT_BYTES
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This record's file allowance is full (30 files / 50 MB). Contact Super Admin.",
    });
  for (const file of files)
    await tx
      .insert(operationFiles)
      .values({
        ...file,
        clientKey: clientKey ?? null,
        parentType,
        parentId,
        stage,
        kind,
        eventId: eventId ?? null,
        uploadedBy: actor.id,
        uploaderName: actor.name,
      });
}
