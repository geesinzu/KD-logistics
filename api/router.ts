import { authRouter } from "./auth-router";
import { userRouter } from "./user-router";
import { branchRouter } from "./branch-router";
import { shipmentRouter } from "./shipment-router";
import { tplRouter } from "./tpl-router";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, branches, thirdPartyLogistics } from "@db/schema";
import { sql } from "drizzle-orm";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  health: publicQuery.query(async () => {
    try {
      const db = getDb();
      const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
      const branchCount = await db.select({ count: sql<number>`count(*)` }).from(branches);
      const tplCount = await db.select({ count: sql<number>`count(*)` }).from(thirdPartyLogistics);
      return {
        ok: true,
        db: "connected",
        users: userCount[0]?.count ?? 0,
        branches: branchCount[0]?.count ?? 0,
        tpls: tplCount[0]?.count ?? 0,
      };
    } catch (e: any) {
      return { ok: false, db: "error", error: e.message };
    }
  }),
  auth: authRouter,
  user: userRouter,
  branch: branchRouter,
  shipment: shipmentRouter,
  tpl: tplRouter,
});

export type AppRouter = typeof appRouter;
