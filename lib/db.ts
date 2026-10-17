import { PrismaClient } from "@prisma/client";

// Cache the Prisma Client on the global object in EVERY environment, not
// just dev. On Vercel's serverless platform, a warm lambda instance can be
// reused across multiple invocations — without this cache, each invocation
// created a brand-new PrismaClient (and its own connection pool), which
// exhausted Supabase's pooler connection limit under any real concurrent
// load. This was the actual cause of "max clients reached" errors and the
// general slowness/unreliability, not any specific page's logic.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const c = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  // Speed watch: any query slower than 300 ms goes to the Vercel logs as [slow-query], so slow pages can be found.
  // Only on the server: some browser bundles pull this file in, and the browser stub of Prisma throws on any use.
  if (typeof window === "undefined") (c as unknown as { $on: (e: "query", cb: (x: { duration: number; query: string }) => void) => void }).$on("query", (e) => {
    if (e.duration > 300) console.warn(`[slow-query] ${e.duration}ms ${e.query.slice(0, 300)}`);
  });
  return c as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

globalForPrisma.prisma = prisma;
