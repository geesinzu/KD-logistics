import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../queries/connection";
import { DEPARTMENT_DDL } from "../../db/department-ddl";
export async function departmentsReady() {
  const [result] = await getDb().execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('departments','department_staff','department_requests','department_packages','department_package_events')`
  );
  if (Number((result as unknown as { n: number }[])[0]?.n) !== 5) return false;
  const [roles] = await getDb().execute(
    sql`SELECT COLUMN_TYPE AS kind FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='role'`
  );
  return (
    (roles as unknown as { kind: string }[])[0]?.kind.includes(
      "'department_staff'"
    ) === true
  );
}
export async function requireDepartmentsReady() {
  if (!(await departmentsReady()))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Super Admin must enable department packages first.",
    });
}
export async function enableDepartments() {
  for (const ddl of DEPARTMENT_DDL) await getDb().execute(sql.raw(ddl));
  // Append the new value; keep existing enum ordinals, values and default intact.
  const [result] = await getDb().execute(
    sql`SELECT COLUMN_TYPE AS kind FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='role'`
  );
  const kind = (result as unknown as { kind: string }[])[0]?.kind;
  if (!kind || !/^enum\('[a-z_',]+\)$/.test(kind))
    throw new Error("Unexpected staff role schema; activation stopped.");
  if (!kind.includes("'department_staff'"))
    await getDb().execute(
      sql.raw(
        `ALTER TABLE users MODIFY COLUMN role ${kind.slice(0, -1)},'department_staff') NOT NULL DEFAULT 'viewer'`
      )
    );
}
