import { authRouter } from "./auth-router";
import { userRouter } from "./user-router";
import { branchRouter } from "./branch-router";
import { shipmentRouter } from "./shipment-router";
import { tplRouter } from "./tpl-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  user: userRouter,
  branch: branchRouter,
  shipment: shipmentRouter,
  tpl: tplRouter,
});

export type AppRouter = typeof appRouter;
