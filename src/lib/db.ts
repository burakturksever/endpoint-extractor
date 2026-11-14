import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSqlitePragmas?: boolean };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

async function ensureSqlitePragmas(): Promise<void> {
  if (globalForPrisma.prismaSqlitePragmas) {
    return;
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    globalForPrisma.prismaSqlitePragmas = true;
    return;
  }
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 10000;");
  } catch {
    // Ignore if unsupported or connection not ready.
  } finally {
    globalForPrisma.prismaSqlitePragmas = true;
  }
}

void ensureSqlitePragmas();
