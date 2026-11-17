import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { operationFiles, shipments, branchTransfers } from "@db/schema";
import { authenticateRequest } from "./lib/auth";
import { assertShipmentReadAccess } from "./lib/shipment-access";
import { requireTransferRead } from "./lib/operations-policy";
import { requireOperationsReady } from "./lib/operations-schema";
import { getDb } from "./queries/connection";
import { TRPCError } from "@trpc/server";
const privateFiles = new Hono();
privateFiles.get("/:id", async c => {
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Security-Policy", "sandbox; default-src 'none'");
  const user = await authenticateRequest(c.req.raw.headers);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0)
    return c.json({ error: "File not found" }, 404);
  try {
    await requireOperationsReady();
    const db = getDb();
    const [file] = await db
      .select({
        id: operationFiles.id,
        parentType: operationFiles.parentType,
        parentId: operationFiles.parentId,
        removedAt: operationFiles.removedAt,
        name: operationFiles.name,
        mime: operationFiles.mime,
      })
      .from(operationFiles)
      .where(eq(operationFiles.id, id))
      .limit(1);
    if (!file || file.removedAt)
      return c.json({ error: "File no longer available" }, 404);
    if (file.parentType === "shipment") {
      const [shipment] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, file.parentId))
        .limit(1);
      if (!shipment) return c.json({ error: "File no longer available" }, 404);
      assertShipmentReadAccess({ user }, shipment);
    } else {
      const [transfer] = await db
        .select()
        .from(branchTransfers)
        .where(eq(branchTransfers.id, file.parentId))
        .limit(1);
      if (!transfer) return c.json({ error: "File no longer available" }, 404);
      requireTransferRead(user, transfer);
    }
    const [body] = await db
      .select({ content: operationFiles.content })
      .from(operationFiles)
      .where(eq(operationFiles.id, id))
      .limit(1);
    if (!body?.content)
      return c.json({ error: "File no longer available" }, 404);
    c.header("Content-Type", file.mime);
    c.header(
      "Content-Disposition",
      `attachment; filename="kedi-document"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`
    );
    return c.body(new Uint8Array(body.content));
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN")
      return c.json({ error: "You cannot access this file" }, 403);
    if (error instanceof TRPCError && error.code === "PRECONDITION_FAILED")
      return c.json({ error: error.message }, 503);
    return c.json({ error: "Could not download this file" }, 500);
  }
});
export default privateFiles;
