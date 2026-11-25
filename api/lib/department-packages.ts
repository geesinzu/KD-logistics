import { and, eq, inArray, isNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  departmentPackages as packages,
  departmentRequests as requests,
  departmentPackageEvents as events,
} from "@db/schema";
import type { getDb } from "../queries/connection";
export type DepartmentTx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
export const invalidPackage = () =>
  new TRPCError({
    code: "CONFLICT",
    message:
      "A selected package is unavailable, not received at the logistics office, or belongs to another branch. Refresh the list.",
  });
export function assertIncludable(
  p: {
    shipmentId: number | null;
    receivedOfficeAt: unknown;
    receivedBranchAt: unknown;
  },
  destination: number,
  requestedDestination: number,
  cancelled: unknown
) {
  if (
    destination !== requestedDestination ||
    cancelled ||
    p.shipmentId ||
    !p.receivedOfficeAt ||
    p.receivedBranchAt
  )
    throw invalidPackage();
}
export async function includeDepartmentPackages(
  tx: DepartmentTx,
  ids: number[],
  shipmentId: number,
  destination: number,
  actor: number
) {
  if (new Set(ids).size !== ids.length) throw invalidPackage();
  // The request is locked before its packages, matching cancel/receipt writers.
  const preliminary = await tx
    .select({ requestId: packages.requestId })
    .from(packages)
    .where(inArray(packages.id, ids));
  if (preliminary.length !== ids.length) throw invalidPackage();
  const requestIds = [...new Set(preliminary.map(p => p.requestId))].sort(
    (a, b) => a - b
  );
  const parents = await tx
    .select()
    .from(requests)
    .where(inArray(requests.id, requestIds))
    .orderBy(asc(requests.id))
    .for("update");
  const rows = await tx
    .select()
    .from(packages)
    .where(inArray(packages.id, ids))
    .orderBy(asc(packages.id))
    .for("update");
  if (rows.length !== ids.length) throw invalidPackage();
  for (const p of rows) {
    const parent = parents.find(r => r.id === p.requestId);
    if (!parent) throw invalidPackage();
    assertIncludable(p, destination, parent.destBranchId, parent.cancelledAt);
    await tx
      .update(packages)
      .set({ shipmentId, includedAt: new Date(), includedBy: actor })
      .where(eq(packages.id, p.id));
    await tx
      .insert(events)
      .values({
        packageId: p.id,
        actorId: actor,
        action: "included",
        note: `Selected for shipment #${shipmentId}. Warehouse packing not separately verified.`,
      });
  }
}
export async function releaseDepartmentPackages(
  tx: DepartmentTx,
  shipmentId: number,
  actor: number,
  reason: string
) {
  const rows = await tx
    .select()
    .from(packages)
    .where(eq(packages.shipmentId, shipmentId))
    .orderBy(asc(packages.id))
    .for("update");
  if (rows.some(p => p.receivedBranchAt))
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "A department package has already been received by the branch. Its shipment cannot be cancelled or deleted.",
    });
  for (const p of rows) {
    await tx
      .update(packages)
      .set({ shipmentId: null, includedAt: null, includedBy: null })
      .where(and(eq(packages.id, p.id), isNull(packages.receivedBranchAt)));
    await tx
      .insert(events)
      .values({
        packageId: p.id,
        actorId: actor,
        action: "released",
        note: reason.slice(0, 500),
      });
  }
}
