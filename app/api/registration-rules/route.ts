import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { getPolicy, EXEMPTION_RULES, type CreditRule } from "../../../lib/registrationRules";
import { withErrors } from "../../../lib/apiHandler";

const db = prisma as unknown as Record<string, any>;
const chairmanOf = (u: { id: string; role: string; managedById: string | null }) => (u.role === "CHAIRMAN" ? u.id : u.role === "OMC" ? u.managedById || "" : "");

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !["OMC", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = chairmanOf(user);
  const policy = await getPolicy(chairmanId);
  let exemptions: any[] = [];
  try { exemptions = await db.registrationExemption.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 300 }); } catch { /* table not created yet */ }
  const students = await prisma.student.findMany({ where: { id: { in: exemptions.map((e) => e.studentId) } }, select: { id: true, name: true, rollNumber: true } });
  const granters = await prisma.user.findMany({ where: { id: { in: exemptions.map((e) => e.grantedById) } }, select: { id: true, name: true } });
  return NextResponse.json({
    policy, rules: EXEMPTION_RULES, canEditPolicy: true, canExempt: user.role === "CHAIRMAN",
    exemptions: exemptions.map((e) => ({ ...e, student: students.find((s) => s.id === e.studentId) || null, grantedBy: granters.find((g) => g.id === e.grantedById)?.name || "" })),
  });
}

// The OMC (or the Institute Head) saves the rules.
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["OMC", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = chairmanOf(user);
  const b = await req.json().catch(() => ({}));
  const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  const rules: CreditRule[] = (Array.isArray(b.creditRules) ? b.creditRules : []).map((r: any) => ({
    label: String(r.label || "").slice(0, 80), codes: String(Array.isArray(r.codes) ? r.codes.join(",") : r.codes || "").split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 30),
    titleContains: String(r.titleContains || "").slice(0, 80), minCredits: int(r.minCredits, 0, 300),
  })).filter((r: CreditRule) => r.minCredits > 0 && (r.codes.length || r.titleContains));
  const data = {
    lowCgpaThreshold: Math.min(4, Math.max(0, Number(b.lowCgpaThreshold) || 2)),
    minCreditsNormal: int(b.minCreditsNormal, 0, 30), maxCreditsNormal: int(b.maxCreditsNormal, 1, 30), maxCreditsLowCgpa: int(b.maxCreditsLowCgpa, 1, 30),
    maxNewCoursesLowCgpa: int(b.maxNewCoursesLowCgpa, 0, 10), maxCreditsFinalYear: int(b.maxCreditsFinalYear, 1, 30), maxCreditsSummer: int(b.maxCreditsSummer, 0, 15),
    allowConcurrentPrereq: b.allowConcurrentPrereq === true, creditRules: JSON.stringify(rules), updatedById: user.id,
  };
  try {
    await db.registrationPolicy.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data });
  } catch {
    return NextResponse.json({ error: "The registration-rules table doesn't exist yet. Run prisma/migration_registration_rules.sql in Supabase first." }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "REGISTRATION_RULES_SAVED", entityType: "RegistrationPolicy", entityId: chairmanId });
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const PUT = withErrors(PUT_handler);
