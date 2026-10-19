import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { savePolicy, DEFAULT_POLICIES } from "../../../lib/leaveRules";

// POST { kind, perYear, carryMax, maxDays, needsDean } — the Institute Head sets a leave type's rules.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!DEFAULT_POLICIES.some((p) => p.kind === b.kind)) return NextResponse.json({ error: "Choose the type." }, { status: 400 });
  const n = (x: unknown) => Math.max(0, Math.min(1000, Number(x) || 0));
  try { await savePolicy(user.id, { kind: b.kind, perYear: n(b.perYear), carryMax: n(b.carryMax), maxDays: b.maxDays ? n(b.maxDays) : null, needsDean: b.needsDean === true || b.needsDean === "true" || b.needsDean === "on" }); }
  catch { return NextResponse.json({ error: "Leave types need prisma/migration_campus_ops.sql — run it in Supabase." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
