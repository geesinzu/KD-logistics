import { drizzle } from "drizzle-orm/mysql2";
import { createConnection } from "mysql2";
import * as schema from "./schema";
import bcrypt from "bcryptjs";

const connection = createConnection(process.env.DATABASE_URL || "");
const db = drizzle(connection, { schema, mode: "planetscale" });

async function seed() {
  console.log("Seeding database...");

  // ── Seed ALL 19 Branches (18 + Lagos HQ) ──
  // Use ON DUPLICATE KEY UPDATE with VALUES(name) to preserve correct names
  const branchValues = [
    { name: "Abeokuta", code: "ABK", city: "Abeokuta", status: "active" },
    { name: "Akure", code: "AKU", city: "Akure", status: "active" },
    { name: "Benin", code: "BEN", city: "Benin City", status: "active" },
    { name: "Onitsha", code: "ONT", city: "Onitsha", status: "active" },
    { name: "Bauchi", code: "BCU", city: "Bauchi", status: "active" },
    { name: "Bayelsa", code: "BYL", city: "Yenagoa", status: "active" },
    { name: "PH", code: "PHC", city: "Port Harcourt", status: "active" },
    { name: "Enugu", code: "ENU", city: "Enugu", status: "active" },
    { name: "Ilorin", code: "ILR", city: "Ilorin", status: "active" },
    { name: "Osogbo", code: "OSG", city: "Osogbo", status: "active" },
    { name: "Ibadan", code: "IBD", city: "Ibadan", status: "active" },
    { name: "Kano", code: "KAN", city: "Kano", status: "active" },
    { name: "Kaduna", code: "KAD", city: "Kaduna", status: "active" },
    { name: "Kedi-Abuja", code: "ABJ", city: "Abuja", status: "active" },
    { name: "Yola", code: "YOL", city: "Yola", status: "active" },
    { name: "Ikeja", code: "IKE", city: "Ikeja, Lagos", status: "active" },
    { name: "Apapa", code: "APA", city: "Apapa, Lagos", status: "active" },
    { name: "Uyo", code: "UYO", city: "Uyo", status: "active" },
    { name: "Lagos HQ", code: "LHQ", city: "Lagos", address: "Oregun Ikeja", status: "active" },
  ];
  for (const b of branchValues) {
    await db.insert(schema.branches).values(b as any).onDuplicateKeyUpdate({
      set: { name: b.name, city: b.city, status: "active" as any },
    });
  }
  console.log("19 branches seeded");

  // ── Seed 3PLs ──
  const tplValues = [
    { name: "S.generation Logistics", code: "SGNL", phone: "+234 805 234 5678", email: "contact@sgeneration.com.ng", address: "Oshodi Apapa Expressway", pickupOptions: "dropoff_only" as const, contactPerson: "Mrs. Okonkwo", status: "active" },
    { name: "Knightpride Logistics", code: "KNGL", phone: "+234 803 123 4567", email: "info@knightpride.com.ng", address: "Lagos-Abuja Expressway", pickupOptions: "both" as const, contactPerson: "Mr. Adebayo", status: "active" },
    { name: "Emmbay Logistics", code: "EMBL", phone: "+234 807 345 6789", email: "support@emmbay.com.ng", address: "Murtala Muhammed Airport Road", pickupOptions: "both" as const, contactPerson: "Mr. Ibrahim", status: "active" },
  ];
  for (const t of tplValues) {
    await db.insert(schema.thirdPartyLogistics).values(t as any).onDuplicateKeyUpdate({
      set: { name: t.name, phone: t.phone, pickupOptions: t.pickupOptions, status: "active" as any },
    });
  }
  console.log("3PLs seeded");

  // ── Seed TPL Users ──
  const tplPw = await bcrypt.hash("tpl1234", 10);
  const tplUserValues = [
    { tplId: 1, name: "S.gen Staff", phone: "+234 805 222 2222", passwordHash: tplPw, role: "tpl_staff" as const, status: "active" },
    { tplId: 2, name: "Knightpride Staff", phone: "+234 803 111 1111", passwordHash: tplPw, role: "tpl_staff" as const, status: "active" },
    { tplId: 3, name: "Emmbay Staff", phone: "+234 807 333 3333", passwordHash: tplPw, role: "tpl_staff" as const, status: "active" },
  ];
  for (const u of tplUserValues) {
    await db.insert(schema.tplUsers).values(u as any).onDuplicateKeyUpdate({
      set: { name: u.name, passwordHash: u.passwordHash, status: "active" as any },
    });
  }
  console.log("TPL users seeded");

  // ── Seed Super Admin Only: Gbenga Adebayo ──
  const passwordHash = await bcrypt.hash("kedi1234", 10);
  await db.insert(schema.users).values({
    name: "Gbenga Adebayo",
    phone: "08118018662",
    passwordHash,
    role: "super_admin" as const,
    status: "active" as const,
    branchId: 19,
  } as any).onDuplicateKeyUpdate({
    set: { name: "Gbenga Adebayo", passwordHash, role: "super_admin" as any, status: "active" as any },
  });
  console.log("Super admin seeded: Gbenga Adebayo (08118018662)");

  console.log("Seed complete!");
  connection.end();
}

seed().catch(console.error);
