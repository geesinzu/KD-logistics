import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users, tplUsers } from "@db/schema";
import { getDb } from "../queries/connection";
import type { User, TplUser } from "@db/schema";

import { jwtKey } from "./jwt-key";
const JWT_SECRET = jwtKey(process.env.JWT_SECRET, process.env.NODE_ENV === "production");

export async function createToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId), type: "kedi" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function createTplToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId), type: "tpl" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: number; type: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"], clockTolerance: 60 });
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !["kedi", "tpl"].includes(String(payload.type)) || typeof payload.exp !== "number") return null;
    return { userId, type: payload.type as string };
  } catch {
    return null;
  }
}

export async function authenticateRequest(headers: Headers): Promise<User | undefined> {
  const authHeader = headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const token = authHeader.slice(7);
  const result = await verifyToken(token);
  if (!result) return undefined;

  const db = getDb();
  if (result.type !== "kedi") {
    // For TPL users, we need to return a compatible User-like object
    // We'll handle this separately in the context
    return undefined;
  }

  const results = await db.select().from(users).where(eq(users.id, result.userId)).limit(1);
  return results[0]?.status === "active" ? results[0] : undefined;
}

export async function authenticateTplRequest(headers: Headers): Promise<TplUser | undefined> {
  const authHeader = headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const token = authHeader.slice(7);
  const result = await verifyToken(token);
  if (!result || result.type !== "tpl") return undefined;

  const db = getDb();
  const results = await db.select().from(tplUsers).where(eq(tplUsers.id, result.userId)).limit(1);
  return results[0]?.status === "active" ? results[0] : undefined;
}
