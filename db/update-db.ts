import { createConnection } from "mysql2/promise";

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL || "");

  // Add profile_picture column
  try {
    await conn.execute("ALTER TABLE users ADD COLUMN profile_picture TEXT");
    console.log("profile_picture column added");
  } catch (e: any) {
    if (e.message?.includes("Duplicate")) {
      console.log("profile_picture column already exists");
    } else {
      console.log("Column add error:", e.message);
    }
  }

  // Delete all old users except Gbenga
  await conn.execute("DELETE FROM users WHERE phone != '08118018662'");
  console.log("Old users deleted");

  // Check remaining users
  const [rows]: any = await conn.execute("SELECT id, name, phone, role FROM users");
  console.log("Remaining users:", rows);

  await conn.end();
  console.log("Done!");
}

main().catch(console.error);
