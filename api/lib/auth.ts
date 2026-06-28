import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users } from "@db/schema";
import { getDb } from "../queries/connection";
import type { User } from "@db/schema";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "kedi-logistics-secret-key-2026"
);

export async function createToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
    return payload.sub ? Number(payload.sub) : null;
  } catch {
    return null;
  }
}

export async function authenticateRequest(headers: Headers): Promise<User | undefined> {
  const authHeader = headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.slice(7);
  const userId = await verifyToken(token);
  if (!userId) return undefined;

  const db = getDb();
  const results = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return results[0];
}
