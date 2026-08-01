import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __medgrowthPrisma: PrismaClient | undefined;
}

// Singleton pattern required in Next.js dev mode to avoid exhausting Postgres
// connections on hot reload — each module reload would otherwise create a
// brand new PrismaClient.
export const db =
  globalThis.__medgrowthPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__medgrowthPrisma = db;
}

export * from "@prisma/client";
