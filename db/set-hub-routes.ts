// One-time setup: tells the app which branches are served via a hub.
//   Uyo, Bayelsa  -> delivered by the 3PL to PH, then sent on by PH staff
//   Bauchi, Yola  -> delivered by the 3PL to Kano, then sent on by Kano staff
//
// Only affects shipments created AFTER it runs: each shipment copies its
// branch's hub at creation, so nothing already in flight changes route.
// Also prints whether each branch involved has an active branch manager,
// since hub and destination managers are the ones notified and asked to act.
//
// Dry-run by default. Pass --apply to write.
//   npx tsx db/set-hub-routes.ts            (dry run)
//   npx tsx db/set-hub-routes.ts --apply    (writes for real)

import { createConnection } from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema";
import { branches, users } from "./schema";

const APPLY = process.argv.includes("--apply");

const ROUTES: { branch: string; hub: string }[] = [
  { branch: "Uyo", hub: "PH" },
  { branch: "Bayelsa", hub: "PH" },
  { branch: "Bauchi", hub: "Kano" },
  { branch: "Yola", hub: "Kano" },
];

async function main() {
  const connection = createConnection(process.env.DATABASE_URL || "");
  const db = drizzle(connection, { schema, mode: "planetscale" });

  const all = await db.select().from(branches);
  const byName = (name: string) => all.find(b => b.name.trim().toLowerCase() === name.toLowerCase());

  let problems = 0;
  let changes = 0;

  console.log("── Hub routes ──");
  for (const route of ROUTES) {
    const branch = byName(route.branch);
    const hub = byName(route.hub);
    if (!branch || !hub) {
      console.log(`[MISSING] ${route.branch} -> ${route.hub}: branch "${!branch ? route.branch : route.hub}" not found in the branches table. Skipped.`);
      problems++;
      continue;
    }
    if (branch.hubBranchId === hub.id) {
      console.log(`[OK] ${branch.name} already routes via ${hub.name}.`);
      continue;
    }
    console.log(`[SET] ${branch.name} -> via ${hub.name}${branch.hubBranchId ? ` (currently hub id ${branch.hubBranchId})` : ""}`);
    changes++;
    if (APPLY) await db.update(branches).set({ hubBranchId: hub.id }).where(eq(branches.id, branch.id));
  }

  console.log("\n── Branch managers (who will be notified and asked to act) ──");
  const involved = [...new Set(ROUTES.flatMap(r => [r.branch, r.hub]))];
  for (const name of involved) {
    const branch = byName(name);
    if (!branch) continue;
    const managers = await db.select({ name: users.name }).from(users)
      .where(and(eq(users.role, "branch_manager"), eq(users.branchId, branch.id), eq(users.status, "active")));
    if (managers.length === 0) {
      console.log(`[NO MANAGER] ${branch.name}: no active branch manager account. Nobody there will be notified or able to act.`);
      problems++;
    } else {
      console.log(`[OK] ${branch.name}: ${managers.length} active manager(s): ${managers.map(m => m.name).join(", ")}`);
    }
  }

  console.log("\n── Summary ──");
  console.log(`Mode: ${APPLY ? "APPLIED (wrote to database)" : "DRY RUN (nothing written -- pass --apply to write)"}`);
  console.log(`Routes to set: ${changes}`);
  console.log(`Problems to look at: ${problems}`);
  connection.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
