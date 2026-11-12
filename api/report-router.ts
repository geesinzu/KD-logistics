import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, gte, lt, inArray } from "drizzle-orm";
import {
  shipments,
  branches,
  thirdPartyLogistics,
  trackingEvents,
} from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  buildBriefRows,
  cohortRange,
  type CustodyEvent,
} from "@contracts/delivery-brief";

export const reportRouter = createRouter({
  brief: authedQuery
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
        compare: z.boolean().default(true),
        branchId: z.number().int().positive().optional(),
        partnerId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (
        !ctx.user ||
        !["super_admin", "admin", "logistics_officer", "viewer"].includes(
          ctx.user.role
        )
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Reports are only available to KEDI’s ops team.",
        });
      let range;
      try {
        range = cohortRange(input.from, input.to);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (e as Error).message,
        });
      }
      const db = getDb();
      const conditions = [
        gte(
          shipments.createdAt,
          new Date(input.compare ? range.previousStart : range.start)
        ),
        lt(shipments.createdAt, new Date(range.end)),
      ];
      if (input.branchId)
        conditions.push(inArray(shipments.destBranchId, [input.branchId]));
      if (input.partnerId)
        conditions.push(inArray(shipments.tplId, [input.partnerId]));
      const [items, offices, partners] = await Promise.all([
        db
          .select({
            id: shipments.id,
            trackingId: shipments.trackingId,
            destBranchId: shipments.destBranchId,
            tplId: shipments.tplId,
            hubBranchId: shipments.hubBranchId,
            createdAt: shipments.createdAt,
            status: shipments.status,
            estimatedDeliveryDate: shipments.estimatedDeliveryDate,
            deliveredAt: shipments.deliveredAt,
            completedAt: shipments.completedAt,
            hubArrivedAt: shipments.hubArrivedAt,
            onwardDispatchedAt: shipments.onwardDispatchedAt,
            onwardDetails: shipments.onwardDetails,
          })
          .from(shipments)
          .where(and(...conditions)),
        db.select({ id: branches.id, name: branches.name }).from(branches),
        db
          .select({
            id: thirdPartyLogistics.id,
            name: thirdPartyLogistics.name,
          })
          .from(thirdPartyLogistics),
      ]);
      const events: CustodyEvent[] = [];
      // Chunk IN lists; read only the two events establishing actual custody.
      for (let offset = 0; offset < items.length; offset += 500)
        events.push(
          ...(await db
            .select({
              shipmentId: trackingEvents.shipmentId,
              createdAt: trackingEvents.createdAt,
            })
            .from(trackingEvents)
            .where(
              and(
                inArray(
                  trackingEvents.shipmentId,
                  items.slice(offset, offset + 500).map(s => s.id)
                ),
                inArray(trackingEvents.eventType, [
                  "driver_dropoff_at_3pl",
                  "tpl_pickup_from_warehouse",
                ])
              )
            ))
        );
      const generatedAt = new Date();
      const rows = buildBriefRows(
        items,
        events,
        new Map(offices.map(b => [b.id, b.name])),
        new Map(partners.map(p => [p.id, p.name])),
        generatedAt.getTime()
      );
      return {
        current: rows.filter(
          r => r.created !== null && r.created >= range.start
        ),
        previous: input.compare
          ? rows.filter(r => r.created !== null && r.created < range.start)
          : [],
        offices,
        partners,
        generatedAt,
        previousFrom: range.previousFrom,
        previousTo: range.previousTo,
      };
    }),
});
