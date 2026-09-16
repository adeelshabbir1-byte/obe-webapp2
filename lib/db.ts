import { PrismaClient } from "@prisma/client";

// Cache the Prisma Client on the global object in EVERY environment, not
// just dev. On Vercel's serverless platform, a warm lambda instance can be
// reused across multiple invocations — without this cache, each invocation
// created a brand-new PrismaClient (and its own connection pool), which
// exhausted Supabase's pooler connection limit under any real concurrent
// load. This was the actual cause of "max clients reached" errors and the
// general slowness/unreliability, not any specific page's logic.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
