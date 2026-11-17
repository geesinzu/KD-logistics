import { randomBytes } from "node:crypto";
export function jwtKey(secret: string | undefined, production: boolean): Uint8Array {
  const configured = secret?.trim();
  // Refuse missing, weak or the former source-known default in production.
  if (production && (!configured || Buffer.byteLength(configured) < 32 || configured === "kedi-logistics-secret-key-2026")) throw new Error("JWT_SECRET must be a private random value of at least 32 bytes in production.");
  return configured ? new TextEncoder().encode(configured) : randomBytes(32);
}
