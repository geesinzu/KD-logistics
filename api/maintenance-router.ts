import { createConnection } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, superAdminQuery } from "./middleware";
import { env } from "./lib/env";
import { runHistoricalAcknowledgements } from "./lib/historical-acknowledgements";

async function run(userId: number, digest?: string) {
  let connection;
  try {
    connection = await createConnection({ uri: env.databaseUrl, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false });
    return await runHistoricalAcknowledgements(connection, userId, digest);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not confirm the correction result. Refresh the preview before trying again." });
  } finally {
    if (connection) await connection.end();
  }
}

export const maintenanceRouter = createRouter({
  historicalAckPreview: superAdminQuery.query(({ ctx }) => {
    if (ctx.user.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "An active Super Admin account is required." });
    return run(ctx.user.id);
  }),
  historicalAckApply: superAdminQuery
    .input(z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal("ACKNOWLEDGE BEFORE NOVEMBER 2026") }))
    .mutation(({ ctx, input }) => {
      if (ctx.user.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "An active Super Admin account is required." });
      return run(ctx.user.id, input.digest);
    }),
});
