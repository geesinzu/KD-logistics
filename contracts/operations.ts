import { z } from "zod";
export const TRANSFER_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "dispatched",
  "partially_received",
  "received",
] as const;
export const TRANSFER_LABELS: Record<
  (typeof TRANSFER_STATUSES)[number],
  string
> = {
  requested: "Awaiting approval",
  approved: "Ready to send",
  rejected: "Not approved",
  cancelled: "Cancelled",
  dispatched: "Sent · awaiting receipt",
  partially_received: "Partly received",
  received: "Received in full",
};
export const DOCUMENT_KINDS = [
  "waybill",
  "delivery_note",
  "invoice",
  "packing_list",
  "other",
] as const;
export const DOCUMENT_LABELS: Record<(typeof DOCUMENT_KINDS)[number], string> =
  {
    waybill: "Waybill",
    delivery_note: "Delivery note",
    invoice: "Invoice",
    packing_list: "Packing list",
    other: "Other document",
  };
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PARENT_BYTES = 50 * 1024 * 1024;
export const MAX_PARENT_FILES = 30;
export const fileInput = z.object({
  name: z.string().trim().min(1).max(180),
  mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  base64: z
    .string()
    .min(4)
    .max(Math.ceil(MAX_FILE_BYTES / 3) * 4),
});
export type UploadInput = z.infer<typeof fileInput>;
export const transportInput = z
  .object({
    companyName: z.string().trim().min(2).max(150),
    contactName: z.string().trim().min(2).max(100),
    contactPhone: z
      .string()
      .trim()
      .regex(
        /^\+?[0-9 ()-]{7,25}$/,
        "Enter the transport contact's phone number"
      )
      .refine(value => {
        const digits = value.replace(/\D/g, "").length;
        return digits >= 7 && digits <= 15;
      }, "Enter a valid contact phone number"),
    deliveryMode: z.enum(["door_to_door", "pickup"]),
    pickupLocation: z.string().trim().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.deliveryMode === "pickup" && v.pickupLocation.length < 3)
      ctx.addIssue({
        code: "custom",
        path: ["pickupLocation"],
        message: "Enter where the receiving branch should collect the items",
      });
  });
export type TransportInput = z.infer<typeof transportInput>;
export const transferCreateInput = z
  .object({
    clientKey: z.string().uuid(),
    sourceBranchId: z.number().int().positive(),
    destinationBranchId: z.number().int().positive(),
    description: z.string().trim().min(5).max(3000),
    quantity: z.number().int().positive().max(1_000_000),
    unit: z.string().trim().min(2).max(30),
    reason: z.string().trim().min(5).max(1500),
    transport: transportInput,
    photos: z
      .array(fileInput)
      .min(1, "Add at least one photo of the items")
      .max(5),
  })
  .refine(v => v.sourceBranchId !== v.destinationBranchId, {
    path: ["destinationBranchId"],
    message: "Choose a different receiving branch",
  });
const actionBase = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  clientKey: z.string().uuid(),
});
export const transferActionInput = z.discriminatedUnion("action", [
  actionBase.extend({
    action: z.literal("approve"),
    note: z.string().trim().max(1500).default(""),
  }),
  actionBase.extend({
    action: z.literal("reject"),
    note: z.string().trim().min(5).max(1500),
  }),
  actionBase.extend({
    action: z.literal("cancel"),
    note: z.string().trim().min(5).max(1500),
  }),
  actionBase.extend({
    action: z.literal("dispatch"),
    note: z.string().trim().max(1500).default(""),
    transport: transportInput,
    photos: z.array(fileInput).max(5).default([]),
  }),
  actionBase.extend({
    action: z.literal("receive"),
    quantity: z.number().int().positive().max(1_000_000),
    note: z.string().trim().max(1500).default(""),
    photos: z
      .array(fileInput)
      .min(1, "Add a photo of the items received")
      .max(5),
  }),
]);
export type TransferActionInput = z.infer<typeof transferActionInput>;
export const TRANSFER_ROLES = [
  "super_admin",
  "admin",
  "logistics_officer",
  "branch_manager",
  "viewer",
] as const;
