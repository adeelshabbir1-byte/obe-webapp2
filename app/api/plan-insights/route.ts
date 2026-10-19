import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { setMinClass } from "../../../lib/extraCourses";

// POST { minExtraClass } — the Institute Head sets the smallest class an extra section is suggested for.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets this." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const n = parseInt(String(b.minExtraClass), 10);
  if (!Number.isFinite(n) || n < 1 || n > 200) return NextResponse.json({ error: "Give a number from 1 to 200." }, { status: 400 });
  try { await setMinClass(await chairmanIdFor(user), n); } catch { return NextResponse.json({ error: "Run prisma/migration_degree_planner.sql in Supabase first." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
