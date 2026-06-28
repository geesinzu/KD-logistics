import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  // For backwards compat with OAuth - look up by phone pattern if unionId stored
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, unionId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser & { unionId?: string; avatar?: string | null }) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastLoginAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    data.unionId &&
    data.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}
