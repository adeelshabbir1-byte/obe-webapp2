import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Uptime check: is the app up and can it reach the database? Answers within 2 seconds either way:
// { ok, db: "up" | "down", version, ms }. 200 when everything is fine, 503 when the database is down.
// No sign-in needed and no personal data in the reply.
export async function GET() {
  const t0 = Date.now();
  const timeout = new Promise<"timeout">((res) => setTimeout(() => res("timeout"), 1500));
  let db: "up" | "down" = "down";
  try {
    const r = await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => "up" as const), timeout]);
    db = r === "up" ? "up" : "down";
  } catch { db = "down"; }
  const body = { ok: db === "up", db, version: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 8), ms: Date.now() - t0 };
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
