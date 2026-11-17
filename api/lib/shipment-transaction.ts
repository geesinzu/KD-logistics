import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { shipments } from "@db/schema";
import type { getDb } from "../queries/connection";
type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Shipment = typeof shipments.$inferSelect;
type AfterCommit = (effect: () => Promise<unknown>) => void;
// All shipment writers lock the shipment first. History and state commit
// together; external notifications are queued only after a successful commit.
export async function withShipmentLock<T>(db: Database, shipmentId: number, work: (tx: Transaction, shipment: Shipment, afterCommit: AfterCommit) => Promise<T>): Promise<T> {
  const effects: (() => Promise<unknown>)[] = [];
  const result = await db.transaction(async tx => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1).for("update");
    if (!shipment) throw new TRPCError({ code: "NOT_FOUND", message: "Shipment not found." });
    return work(tx, shipment, effect => effects.push(effect));
  });
  for (const effect of effects) void effect().catch(error => console.error("[Shipment notification]", error));
  return result;
}
