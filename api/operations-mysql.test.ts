// Destructive integration tests: only the designated disposable localhost schema.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createConnection } from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { operationsRouter } from "./operations-router";
import { shipmentRouter } from "./shipment-router";
import privateFiles from "./private-file-route";
import { createToken, createTplToken } from "./lib/auth";
import type { TrpcContext } from "./context";
import type { TransferActionInput } from "@contracts/operations";
const url = process.env.KEDI_OPERATIONS_TEST_URL;
const image = {
  name: "item.png",
  mime: "image/png" as const,
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
};
const pdf = {
  name: "waybill.pdf",
  mime: "application/pdf" as const,
  base64: Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF"
  ).toString("base64"),
};
const transport = {
  companyName: "Local test transport",
  contactName: "Test contact",
  contactPhone: "08000000000",
  deliveryMode: "door_to_door" as const,
  pickupLocation: "",
};
const identities = [
  { id: 1, name: "Local Super Admin", role: "super_admin", branchId: null },
  {
    id: 2,
    name: "Sending branch manager",
    role: "branch_manager",
    branchId: 10,
  },
  {
    id: 3,
    name: "Receiving branch manager",
    role: "branch_manager",
    branchId: 20,
  },
  { id: 4, name: "Other branch manager", role: "branch_manager", branchId: 30 },
  {
    id: 5,
    name: "Local logistics officer",
    role: "logistics_officer",
    branchId: null,
  },
  { id: 6, name: "Local Admin", role: "admin", branchId: null },
  { id: 7, name: "Local Viewer", role: "viewer", branchId: null },
  { id: 8, name: "Assigned driver", role: "driver", branchId: null },
];
function context(id = 1) {
  return {
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    user: { ...identities.find(u => u.id === id)!, status: "active" },
  } as TrpcContext;
}
const api = (id = 1) => operationsRouter.createCaller(context(id));
const anonymous = () =>
  operationsRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
  } as TrpcContext);
const partner = () =>
  operationsRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    tplUser: { id: 99, tplId: 99, status: "active" },
  } as TrpcContext);
const requestInput = () => ({
  clientKey: randomUUID(),
  sourceBranchId: 10,
  destinationBranchId: 20,
  description: "Sealed KEDI cartons for another branch",
  quantity: 50,
  unit: "cartons",
  reason: "Receiving branch stock request",
  transport,
  photos: [image],
});
describe.skipIf(!url)(
  "documents and separate branch transfers on MySQL",
  () => {
    let db: Connection;
    async function rows(query: string) {
      const [result] = await db.query<RowDataPacket[]>(query);
      return result;
    }
    async function action(
      id: number,
      actor: number,
      values:
        | Omit<TransferActionInput, "id" | "expectedVersion" | "clientKey">
        | Record<string, unknown>
    ) {
      const current = await api(actor).transfer({ id });
      return api(actor).updateTransfer({
        id,
        expectedVersion: current.version,
        clientKey: randomUUID(),
        ...values,
      } as TransferActionInput);
    }
    async function dispatched() {
      const { id } = await api(2).requestTransfer(requestInput());
      await action(id, 1, {
        action: "approve",
        note: "Reviewed the item photos",
      });
      await action(id, 2, {
        action: "dispatch",
        note: "Handed to transport company",
        transport,
        photos: [],
      });
      return id;
    }
    beforeAll(async () => {
      const target = new URL(url!);
      if (
        !["127.0.0.1", "localhost"].includes(target.hostname) ||
        !target.pathname.endsWith("_test") ||
        process.env.DATABASE_URL !== url
      )
        throw Error("Use matching isolated localhost _test URLs only");
      db = await createConnection({ uri: url, dateStrings: true });
    });
    afterAll(async () => {
      if (db) {
        await db.query("DROP TRIGGER IF EXISTS fail_operations_audit");
        await db.end();
      }
    });
    beforeEach(async () => {
      await db.query("DROP TRIGGER IF EXISTS fail_operations_audit");
      for (const table of [
        "operation_files",
        "branch_transfer_events",
        "branch_transfers",
        "activity_log",
        "tracking_events",
        "shipments",
        "users",
        "branches",
      ])
        await db.query(`DELETE FROM ${table}`);
      for (const u of identities)
        await db.query(
          "INSERT INTO users(id,name,phone,password_hash,role,status,branch_id) VALUES(?,?,?,'local-test-only',?,'active',?)",
          [u.id, u.name, `0800000000${u.id}`, u.role, u.branchId]
        );
      await db.query(
        "INSERT INTO branches(id,name,code,status) VALUES(10,'Sending office','SEND','active'),(20,'Receiving office','RECV','active'),(30,'Other office','OTHER','active')"
      );
      await db.query(
        "INSERT INTO shipments(id,tracking_id,created_by,origin_branch_id,dest_branch_id,actual_item_count,status,assigned_driver_id) VALUES(100001,'TEST-DOCUMENT',1,10,20,50,'in_transit_with_3pl',8)"
      );
    });
    it("enables only new feature tables, is repeatable and reserves setup for Super Admin", async () => {
      const before = await rows("SELECT * FROM shipments");
      for (const table of [
        "operation_files",
        "branch_transfer_events",
        "branch_transfers",
      ])
        await db.query(`DROP TABLE ${table}`);
      expect((await api().status()).ready).toBe(false);
      await expect(api(6).enable()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        api(2).documents({ shipmentId: 100001 })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await api().enable();
      await api().enable();
      expect((await api().status()).ready).toBe(true);
      expect(await rows("SELECT * FROM shipments")).toEqual(before);
    });
    it("stores private document bytes, metadata and audit together and makes retries idempotent", async () => {
      const input = {
        shipmentId: 100001,
        kind: "waybill" as const,
        file: pdf,
        clientKey: randomUUID(),
      };
      await api().uploadDocument(input);
      await api().uploadDocument(input);
      const documents = await api().documents({ shipmentId: 100001 });
      expect(documents).toHaveLength(1);
      expect(documents[0]).toMatchObject({
        name: "waybill.pdf",
        kind: "waybill",
        uploaderName: "Local Super Admin",
      });
      expect(documents[0]).not.toHaveProperty("content");
      const [stored] = await rows("SELECT content FROM operation_files");
      expect(stored.content).toEqual(Buffer.from(pdf.base64, "base64"));
      expect(
        await rows("SELECT * FROM activity_log WHERE action='upload_document'")
      ).toHaveLength(1);
      await expect(
        api().uploadDocument({
          ...input,
          file: { ...pdf, name: "another.pdf" },
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const library = await api().library({ search: "TEST-DOCUMENT" });
      expect(library.total).toBe(1);
      expect((await api().library({ kind: "invoice" })).total).toBe(0);
    });
    it("denies unauthenticated and 3PL access to every feature endpoint", async () => {
      for (const caller of [anonymous(), partner()]) {
        for (const call of [
          () => caller.status(),
          () => caller.documents({ shipmentId: 100001 }),
          () =>
            caller.uploadDocument({
              shipmentId: 100001,
              kind: "waybill",
              file: pdf,
              clientKey: randomUUID(),
            }),
          () => caller.library({}),
          () => caller.transfers({}),
          () => caller.requestTransfer(requestInput()),
          () => caller.transfer({ id: 1 }),
        ])
          await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      }
    });
    it("scopes document list, library, upload and actual downloads to the right staff", async () => {
      await api().uploadDocument({
        shipmentId: 100001,
        kind: "invoice",
        file: pdf,
        clientKey: randomUUID(),
      });
      const [file] = await api().documents({ shipmentId: 100001 });
      for (const id of [2, 4]) {
        await expect(
          api(id).documents({ shipmentId: 100001 })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await api(id).library({})).total).toBe(0);
        await expect(
          api(id).uploadDocument({
            shipmentId: 100001,
            kind: "invoice",
            file: pdf,
            clientKey: randomUUID(),
          })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        const response = await privateFiles.request(`/${file.id}`, {
          headers: { authorization: `Bearer ${await createToken(id)}` },
        });
        expect(response.status).toBe(403);
      }
      for (const id of [1, 3, 8]) {
        expect(await api(id).documents({ shipmentId: 100001 })).toHaveLength(1);
        const response = await privateFiles.request(`/${file.id}`, {
          headers: { authorization: `Bearer ${await createToken(id)}` },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(response.headers.get("content-disposition")).toContain(
          "attachment"
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(
          Buffer.from(pdf.base64, "base64")
        );
      }
      expect((await privateFiles.request(`/${file.id}`)).status).toBe(401);
      expect(
        (
          await privateFiles.request(`/${file.id}`, {
            headers: { authorization: `Bearer ${await createTplToken(99)}` },
          })
        ).status
      ).toBe(401);
      await expect(
        api(7).uploadDocument({
          shipmentId: 100001,
          kind: "invoice",
          file: pdf,
          clientKey: randomUUID(),
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("removes document bytes but preserves its removal record; rejects photo evidence removal", async () => {
      await api().uploadDocument({
        shipmentId: 100001,
        kind: "waybill",
        file: pdf,
        clientKey: randomUUID(),
      });
      const [file] = await api().documents({ shipmentId: 100001 });
      await expect(
        api(6).removeDocument({ id: file.id, reason: "Wrong document" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await api().removeDocument({
        id: file.id,
        reason: "Incorrect file replaced",
      });
      expect(
        (
          await rows(
            `SELECT content,removal_reason FROM operation_files WHERE id=${file.id}`
          )
        )[0]
      ).toMatchObject({
        content: null,
        removal_reason: "Incorrect file replaced",
      });
      expect((await api().library({})).total).toBe(0);
      expect(
        (
          await privateFiles.request(`/${file.id}`, {
            headers: { authorization: `Bearer ${await createToken(1)}` },
          })
        ).status
      ).toBe(404);
      const { id } = await api(2).requestTransfer(requestInput());
      const transfer = await api().transfer({ id });
      await expect(
        api().removeDocument({
          id: transfer.files[0].id,
          reason: "Attempted evidence removal",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("retires attached bytes when a shipment is deleted without affecting transfer evidence", async () => {
      await api().uploadDocument({
        shipmentId: 100001,
        kind: "waybill",
        file: pdf,
        clientKey: randomUUID(),
      });
      const [file] = await api().documents({ shipmentId: 100001 });
      const transfer = await api(2).requestTransfer(requestInput());
      await shipmentRouter
        .createCaller(context())
        .deleteShipment({ shipmentId: 100001, reason: "Local test deletion" });
      expect(
        (
          await rows(`SELECT content FROM operation_files WHERE id=${file.id}`)
        )[0].content
      ).toBeNull();
      expect((await api().transfer({ id: transfer.id })).files).toHaveLength(1);
    });
    it("enforces byte quotas and rolls back file uploads if audit fails without exposing file contents", async () => {
      await db.query(
        "INSERT INTO operation_files(parent_type,parent_id,stage,kind,name,mime,size,sha256,content,uploaded_by,uploader_name) VALUES('shipment',100001,'document','other','quota.pdf','application/pdf',52428800,REPEAT('a',64),'x',1,'Local')"
      );
      await expect(
        api().uploadDocument({
          shipmentId: 100001,
          kind: "waybill",
          file: pdf,
          clientKey: randomUUID(),
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await db.query("DELETE FROM operation_files");
      await db.query(
        "CREATE TRIGGER fail_operations_audit BEFORE INSERT ON activity_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Local audit failure'"
      );
      await expect(
        api().uploadDocument({
          shipmentId: 100001,
          kind: "waybill",
          file: pdf,
          clientKey: randomUUID(),
        })
      ).rejects.toThrow("Could not save or load");
      expect(await rows("SELECT * FROM operation_files")).toHaveLength(0);
    });
    it("completes a staff-only request/approval/dispatch/38+12 receipt with both branches' photos", async () => {
      const originalShipments = await rows("SELECT * FROM shipments"),
        originalTracking = await rows("SELECT * FROM tracking_events");
      const id = await dispatched();
      await action(id, 3, {
        action: "receive",
        quantity: 38,
        photos: [image],
        note: "12 cartons still to arrive",
      });
      expect(await api(3).transfer({ id })).toMatchObject({
        status: "partially_received",
        receivedQty: 38,
      });
      await action(id, 3, {
        action: "receive",
        quantity: 12,
        photos: [image],
        note: "Remaining cartons received",
      });
      const done = await api().transfer({ id });
      expect(done).toMatchObject({
        status: "received",
        quantity: 50,
        receivedQty: 50,
        requestedBy: 2,
        approvedBy: 1,
        dispatchedBy: 2,
      });
      expect(done.files.map(f => f.stage)).toEqual([
        "request",
        "receipt",
        "receipt",
      ]);
      expect(done.events.map(e => e.action)).toEqual([
        "request",
        "approve",
        "dispatch",
        "receive",
        "receive",
      ]);
      expect(await rows("SELECT * FROM shipments")).toEqual(originalShipments);
      expect(await rows("SELECT * FROM tracking_events")).toEqual(
        originalTracking
      );
      expect(
        await rows(
          "SELECT * FROM activity_log WHERE entity_type='branch_transfer'"
        )
      ).toHaveLength(5);
    });
    it("requires independent approval, origin dispatch, destination receipt and valid transport/photo evidence", async () => {
      const requested = requestInput();
      const { id } = await api(5).requestTransfer(requested);
      await expect(
        action(id, 5, { action: "approve", note: "Self approval" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        action(id, 2, { action: "approve", note: "Branch approval" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        action(id, 3, {
          action: "receive",
          quantity: 50,
          photos: [image],
          note: "Early",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await action(id, 1, { action: "approve", note: "Reviewed" });
      await expect(
        action(id, 1, {
          action: "dispatch",
          transport,
          photos: [],
          note: "Admin pretending dispatch",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        action(id, 2, {
          action: "dispatch",
          transport: {
            ...transport,
            deliveryMode: "pickup",
            pickupLocation: "",
          },
          photos: [],
          note: "",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await action(id, 2, {
        action: "dispatch",
        transport: {
          ...transport,
          deliveryMode: "pickup",
          pickupLocation: "Test terminal address",
        },
        photos: [image],
        note: "Collected by transport",
      });
      await expect(
        action(id, 2, {
          action: "receive",
          quantity: 50,
          photos: [image],
          note: "Wrong branch",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        action(id, 3, {
          action: "receive",
          quantity: 50,
          photos: [],
          note: "No photo",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        action(id, 3, {
          action: "receive",
          quantity: 38,
          photos: [image],
          note: "",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        action(id, 3, {
          action: "receive",
          quantity: 51,
          photos: [image],
          note: "Too many",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("scopes transfers and photo downloads, including after a staff branch reassignment", async () => {
      const id = await dispatched();
      expect((await api(2).transfers({})).total).toBe(1);
      expect((await api(3).transfers({})).total).toBe(1);
      expect((await api(4).transfers({})).total).toBe(0);
      await expect(api(4).transfer({ id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(api(8).transfers({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        api(7).requestTransfer(requestInput())
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const file = (await api(2).transfer({ id })).files[0];
      expect(
        (
          await privateFiles.request(`/${file.id}`, {
            headers: { authorization: `Bearer ${await createToken(4)}` },
          })
        ).status
      ).toBe(403);
      expect(
        (
          await privateFiles.request(`/${file.id}`, {
            headers: { authorization: `Bearer ${await createToken(3)}` },
          })
        ).status
      ).toBe(200);
      await db.query("UPDATE users SET branch_id=20 WHERE id=2");
      await expect(
        action(id, 2, {
          action: "receive",
          quantity: 50,
          photos: [image],
          note: "Same sender now at destination",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("deduplicates concurrent requests and receipts and rejects stale or altered retries", async () => {
      const input = requestInput();
      const requests = await Promise.all([
        api(2).requestTransfer(input),
        api(2).requestTransfer(input),
      ]);
      expect(requests[0].id).toBe(requests[1].id);
      const id = requests[0].id;
      expect(await rows("SELECT * FROM branch_transfers")).toHaveLength(1);
      await expect(
        api(2).requestTransfer({ ...input, quantity: 49 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await action(id, 1, { action: "approve", note: "Reviewed" });
      await action(id, 2, {
        action: "dispatch",
        transport,
        photos: [],
        note: "Sent",
      });
      const current = await api(3).transfer({ id });
      const receipt = {
        id,
        expectedVersion: current.version,
        clientKey: randomUUID(),
        action: "receive" as const,
        quantity: 38,
        photos: [image],
        note: "12 still outstanding",
      };
      await Promise.all([
        api(3).updateTransfer(receipt),
        api(3).updateTransfer(receipt),
      ]);
      expect((await api(3).transfer({ id })).receivedQty).toBe(38);
      expect(
        await rows(
          `SELECT * FROM branch_transfer_events WHERE transfer_id=${id} AND action='receive'`
        )
      ).toHaveLength(1);
      await expect(
        api(3).updateTransfer({ ...receipt, clientKey: randomUUID() })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        api(3).updateTransfer({ ...receipt, quantity: 12 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("rolls back the status, receipt and photos if the audit cannot be saved", async () => {
      const id = await dispatched();
      const before = await api().transfer({ id });
      await db.query(
        "CREATE TRIGGER fail_operations_audit BEFORE INSERT ON activity_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Local audit failure'"
      );
      await expect(
        action(id, 3, {
          action: "receive",
          quantity: 50,
          photos: [image],
          note: "Received all",
        })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(await api().transfer({ id })).toEqual(before);
    });
    it("keeps rejected/cancelled transfers closed and refuses cancellation after dispatch", async () => {
      const first = await api(2).requestTransfer(requestInput());
      await action(first.id, 1, {
        action: "reject",
        note: "Not needed at receiving branch",
      });
      await expect(
        action(first.id, 2, {
          action: "dispatch",
          transport,
          photos: [],
          note: "",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const second = await api(2).requestTransfer(requestInput());
      await action(second.id, 2, {
        action: "cancel",
        note: "Request no longer needed",
      });
      await expect(
        action(second.id, 1, { action: "approve", note: "" })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const third = await dispatched();
      await expect(
        action(third, 1, { action: "cancel", note: "Already physically sent" })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });
  }
);
