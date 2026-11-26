import { PrismaClient } from "./generated/prisma/client.js";

export const prisma = new PrismaClient();

let pragmasOk = false;

/** WAL + busy_timeout: vários terminais na API sem "database is locked". */
export async function aplicarPragmasSqlite() {
  if (pragmasOk) return;
  // PRAGMAs devolvem resultado no SQLite — usar queryRaw
  await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000");
  await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL");
  pragmasOk = true;
}
