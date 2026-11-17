import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { OPERATIONS_DDL } from "../../db/operations-ddl";
export async function operationsReady() {
  const [rows] = await getDb().execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('branch_transfers','branch_transfer_events','operation_files')`
  );
  return Number((rows as unknown as { n: number }[])[0]?.n) === 3;
}
export async function requireOperationsReady() {
  if (!(await operationsReady()))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Super Admin needs to enable documents and branch transfers first.",
    });
}
export async function enableOperations() {
  for (const ddl of OPERATIONS_DDL) await getDb().execute(sql.raw(ddl));
  if (!(await operationsReady()))
    throw new Error(
      "The new feature tables could not be prepared. Existing shipments were not changed."
    );
}
