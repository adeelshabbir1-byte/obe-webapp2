import { PrismaClient } from "@prisma/client";

// Cache the Prisma Client on the global object in EVERY environment, not
// just dev. On Vercel's serverless platform, a warm lambda instance can be
// reused across multiple invocations — without this cache, each invocation
// created a brand-new PrismaClient (and its own connection pool), which
// exhausted Supabase's pooler connection limit under any real concurrent
// load. This was the actual cause of "max clients reached" errors and the
// general slowness/unreliability, not any specific page's logic.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Connection pooling: on Supabase's pooler (port 6543, PgBouncer) Prisma needs pgbouncer=true; a URL that forgot it
// still works, and a pool wait limit is set so a busy moment queues instead of failing at once.
function pooledUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.port === "6543" && !u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch { return raw; }
}

function makeClient() {
  const url = pooledUrl(process.env.DATABASE_URL);
  const c = new PrismaClient({ log: [{ emit: "event", level: "query" }], ...(url ? { datasources: { db: { url } } } : {}) });
  // Speed watch: any query slower than 300 ms goes to the Vercel logs as [slow-query], so slow pages can be found.
  // Only on the server: some browser bundles pull this file in, and the browser stub of Prisma throws on any use.
  if (typeof window === "undefined") (c as unknown as { $on: (e: "query", cb: (x: { duration: number; query: string }) => void) => void }).$on("query", (e) => {
    if (e.duration > 300) console.warn(`[slow-query] ${e.duration}ms ${e.query.slice(0, 300)}`);
  });
  return c as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

globalForPrisma.prisma = prisma;
