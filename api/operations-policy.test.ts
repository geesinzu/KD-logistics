import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { User } from "@db/schema";
import {
  transferCreateInput,
  transferActionInput,
  transportInput,
  MAX_FILE_BYTES,
} from "@contracts/operations";
import { decodeUpload } from "./lib/private-files";
import { transferPlan, canReadTransfer } from "./lib/operations-policy";
const image = {
  name: "item.png",
  mime: "image/png" as const,
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
};
const transport = {
  companyName: "Local Test Transport",
  contactName: "Test contact",
  contactPhone: "08000000000",
  deliveryMode: "door_to_door" as const,
  pickupLocation: "",
};
const actor = (
  id: number,
  role = "branch_manager",
  branchId: number | null = 10
) => ({ id, role, branchId }) as User;
const transfer = {
  sourceBranchId: 10,
  destinationBranchId: 20,
  requestedBy: 2,
  status: "requested",
  quantity: 50,
  receivedQty: 0,
  dispatchedBy: null as number | null,
};
const request = {
  clientKey: randomUUID(),
  sourceBranchId: 10,
  destinationBranchId: 20,
  description: "Sealed cartons",
  quantity: 50,
  unit: "cartons",
  reason: "Branch stock request",
  transport,
  photos: [image],
};
const base = {
  id: 1,
  expectedVersion: 1,
  clientKey: randomUUID(),
  note: "Checked quantities",
};
describe("branch-transfer and private-file policies", () => {
  it("requires pickup location only for branch collection", () => {
    expect(transportInput.safeParse(transport).success).toBe(true);
    expect(
      transportInput.safeParse({ ...transport, contactPhone: "--------" })
        .success
    ).toBe(false);
    expect(
      transportInput.safeParse({ ...transport, deliveryMode: "pickup" }).success
    ).toBe(false);
    expect(
      transportInput.safeParse({
        ...transport,
        deliveryMode: "pickup",
        pickupLocation: "Terminal 1",
      }).success
    ).toBe(true);
  });
  it.each([0, -1, 1.5, 1_000_001])(
    "rejects invalid requested quantity %s",
    quantity =>
      expect(
        transferCreateInput.safeParse({ ...request, quantity }).success
      ).toBe(false)
  );
  it("requires distinct branches, item photos and a valid request key", () => {
    for (const patch of [
      { destinationBranchId: 10 },
      { photos: [] },
      { photos: Array(6).fill(image) },
      { clientKey: "fake" },
    ])
      expect(
        transferCreateInput.safeParse({ ...request, ...patch }).success
      ).toBe(false);
  });
  it("allows both participating branches and denies an unrelated branch or driver", () => {
    expect(canReadTransfer(actor(2), transfer)).toBe(true);
    expect(canReadTransfer(actor(3, "branch_manager", 20), transfer)).toBe(
      true
    );
    expect(canReadTransfer(actor(4, "branch_manager", 30), transfer)).toBe(
      false
    );
    expect(canReadTransfer(actor(4, "branch_manager", null), transfer)).toBe(
      false
    );
    expect(canReadTransfer(actor(8, "driver"), transfer)).toBe(false);
  });
  it.each(["super_admin", "admin", "logistics_officer"])(
    "requires independent approval even for %s",
    role => {
      expect(() =>
        transferPlan(actor(2, role, null), transfer, {
          ...base,
          action: "approve",
        })
      ).toThrow("Another");
      expect(
        transferPlan(actor(1, role, null), transfer, {
          ...base,
          action: "approve",
        })
      ).toEqual({ status: "approved" });
    }
  );
  it("denies branch and viewer approval, and operations dispatch on behalf of a branch", () => {
    expect(() =>
      transferPlan(actor(2), transfer, { ...base, action: "approve" })
    ).toThrow();
    expect(() =>
      transferPlan(actor(7, "viewer", null), transfer, {
        ...base,
        action: "approve",
      })
    ).toThrow();
    expect(() =>
      transferPlan(
        actor(1, "super_admin", null),
        { ...transfer, status: "approved" },
        { ...base, action: "dispatch", transport, photos: [] }
      )
    ).toThrow("sending branch");
  });
  it("keeps partial receipts open and completes only the outstanding quantity", () => {
    const current = { ...transfer, status: "dispatched", dispatchedBy: 2 };
    expect(
      transferPlan(actor(3, "branch_manager", 20), current, {
        ...base,
        action: "receive",
        quantity: 38,
        photos: [image],
      })
    ).toEqual({ status: "partially_received", receivedQty: 38 });
    expect(
      transferPlan(
        actor(3, "branch_manager", 20),
        { ...current, status: "partially_received", receivedQty: 38 },
        { ...base, action: "receive", quantity: 12, photos: [image] }
      )
    ).toEqual({ status: "received", receivedQty: 50 });
    expect(() =>
      transferPlan(
        actor(3, "branch_manager", 20),
        { ...current, receivedQty: 38 },
        { ...base, action: "receive", quantity: 38, photos: [image] }
      )
    ).toThrow("Only 12");
  });
  it("requires a shortfall reason and independent receiving staff", () => {
    const current = { ...transfer, status: "dispatched", dispatchedBy: 2 };
    expect(() =>
      transferPlan(actor(3, "branch_manager", 20), current, {
        ...base,
        note: "",
        action: "receive",
        quantity: 38,
        photos: [image],
      })
    ).toThrow("Describe");
    expect(() =>
      transferPlan(actor(2, "branch_manager", 20), current, {
        ...base,
        action: "receive",
        quantity: 50,
        photos: [image],
      })
    ).toThrow("independently");
  });
  it.each(["received", "cancelled", "rejected", "requested"])(
    "cannot receive a transfer at %s",
    status =>
      expect(() =>
        transferPlan(
          actor(3, "branch_manager", 20),
          { ...transfer, status },
          { ...base, action: "receive", quantity: 10, photos: [image] }
        )
      ).toThrow()
  );
  it("requires receipt photos and whole positive quantities at the API boundary", () => {
    expect(
      transferActionInput.safeParse({
        ...base,
        action: "receive",
        quantity: 5,
        photos: [],
      }).success
    ).toBe(false);
    expect(
      transferActionInput.safeParse({
        ...base,
        action: "receive",
        quantity: 1.5,
        photos: [image],
      }).success
    ).toBe(false);
  });
  it("validates bytes rather than the filename or claimed MIME and sanitises filenames", () => {
    expect(decodeUpload(image).mime).toBe("image/png");
    expect(
      decodeUpload({ ...image, name: "../private\r\nheader.exe" }).name
    ).toBe(".._private__header.png");
    expect(() => decodeUpload({ ...image, mime: "application/pdf" })).toThrow(
      "genuine"
    );
    expect(() =>
      decodeUpload({
        name: "invoice.pdf",
        mime: "application/pdf",
        base64: Buffer.from("<script>alert(1)</script>").toString("base64"),
      })
    ).toThrow("genuine");
    expect(() =>
      decodeUpload(
        {
          name: "item.pdf",
          mime: "application/pdf",
          base64: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"),
        },
        true
      )
    ).toThrow("photo");
    expect(() => decodeUpload({ ...image, base64: "not base64!" })).toThrow(
      "encoding"
    );
    expect(() =>
      decodeUpload({
        ...image,
        base64: Buffer.alloc(MAX_FILE_BYTES + 1).toString("base64"),
      })
    ).toThrow("5 MB");
  });
});
