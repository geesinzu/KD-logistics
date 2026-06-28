import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2";
import * as schema from "./schema";
import bcrypt from "bcryptjs";

const connection = createConnection(process.env.DATABASE_URL || "");
const db = drizzle(connection, { schema, mode: "planetscale" });

async function seed() {
  console.log("Seeding database...");

  // ── Seed Branches ──
  await db.insert(schema.branches).values([
    { name: "Port Harcourt", code: "PH", city: "Port Harcourt", address: "Trans Amadi Industrial Layout", status: "active" },
    { name: "Kano", code: "KN", city: "Kano", address: "Sabon Gari Market", status: "active" },
    { name: "Abuja", code: "AB", city: "Abuja", address: "Wuse Zone 5", status: "active" },
    { name: "Lagos HQ", code: "LH", city: "Lagos", address: "Oregun Ikeja", status: "active" },
    { name: "Bauchi", code: "BC", city: "Bauchi", address: "Central Market", status: "active" },
    { name: "Yola", code: "YL", city: "Yola", address: "Jimeta Market", status: "active" },
  ]).onDuplicateKeyUpdate({ set: { name: "name" as any } });
  console.log("Branches seeded");

  // ── Seed 3PLs ──
  await db.insert(schema.thirdPartyLogistics).values([
    { name: "Knightpride Logistics", code: "KNGL", phone: "+234 803 123 4567", email: "info@knightpride.com.ng", address: "Lagos-Abuja Expressway", pickupOptions: "both", contactPerson: "Mr. Adebayo", status: "active" },
    { name: "S.Generation Logistics", code: "SGNL", phone: "+234 805 234 5678", email: "contact@sgeneration.com.ng", address: "Oshodi Apapa Expressway", pickupOptions: "dropoff_only", contactPerson: "Mrs. Okonkwo", status: "active" },
    { name: "Emmbay Logistics", code: "EMBL", phone: "+234 807 345 6789", email: "support@emmbay.com.ng", address: "Murtala Muhammed Airport Road", pickupOptions: "both", contactPerson: "Mr. Ibrahim", status: "active" },
  ]).onDuplicateKeyUpdate({ set: { name: "name" as any } });
  console.log("3PLs seeded");

  // ── Seed Users ──
  const passwordHash = await bcrypt.hash("kedi1234", 10);
  await db.insert(schema.users).values([
    { name: "Terry Solomon", phone: "+234 801 000 0001", passwordHash, role: "super_admin", status: "active", branchId: 4 },
    { name: "Admin User", phone: "+234 801 000 0002", passwordHash, role: "admin", status: "active", branchId: 4 },
    { name: "Logistics Officer 1", phone: "+234 801 000 0003", passwordHash, role: "logistics_officer", status: "active", branchId: 4 },
    { name: "Warehouse Officer", phone: "+234 801 000 0004", passwordHash, role: "warehouse_supply", status: "active", branchId: 4 },
    { name: "Branch Manager PH", phone: "+234 801 000 0005", passwordHash, role: "branch_manager", status: "active", branchId: 1 },
    { name: "Driver John", phone: "+234 801 000 0006", passwordHash, role: "driver", status: "active", branchId: 4 },
    { name: "Driver Emmanuel", phone: "+234 801 000 0007", passwordHash, role: "driver", status: "active", branchId: 4 },
    { name: "Shipment Creator", phone: "+234 801 000 0008", passwordHash, role: "shipment_creator", status: "active", branchId: 4 },
  ]).onDuplicateKeyUpdate({ set: { name: "name" as any } });
  console.log("Users seeded");

  console.log("Seed complete!");
  connection.end();
}

seed().catch(console.error);
