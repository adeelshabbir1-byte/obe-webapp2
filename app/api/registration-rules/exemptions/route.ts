import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { EXEMPTION_RULES } from "../../../../lib/registrationRules";

const db = prisma as unknown as Record<string, any>;

// The Institute Head grants (POST) or revokes (DELETE ?id=) an exemption for one student.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head can grant exemptions." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const rule = String(b.rule || "");
  if (!EXEMPTION_RULES[rule]) return NextResponse.json({ error: "choose a rule" }, { status: 400 });
  const reason = String(b.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "give a reason" }, { status: 400 });
  const roll = String(b.rollNumber || "").trim();
  const student = await prisma.student.findFirst({ where: { rollNumber: { equals: roll, mode: "insensitive" }, batch: { coordinator: { managedById: user.id } } }, select: { id: true, name: true } });
  if (!student) return NextResponse.json({ error: `No student with roll number "${roll}" in your institute.` }, { status: 404 });
  const value = b.value === "" || b.value == null ? null : Math.max(0, Math.round(Number(b.value)));
  if ((rule === "MAX_LOAD" || rule === "NEW_COURSE_LIMIT") && (value === null || !Number.isFinite(value))) return NextResponse.json({ error: "enter the allowed number" }, { status: 400 });
  try {
    await db.registrationExemption.create({ data: { chairmanId: user.id, studentId: student.id, rule, courseCode: b.courseCode ? String(b.courseCode).trim().toUpperCase() : null, value, reason: reason.slice(0, 1000), grantedById: user.id } });
  } catch {
    return NextResponse.json({ error: "Run prisma/migration_registration_rules.sql in Supabase first." }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "REGISTRATION_EXEMPTION_GRANTED", entityType: "Student", entityId: student.id, metadata: { rule } });
  return NextResponse.json({ ok: true, student: student.name });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head can revoke exemptions." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const r = await db.registrationExemption.updateMany({ where: { id, chairmanId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "REGISTRATION_EXEMPTION_REVOKED", entityType: "RegistrationExemption", entityId: id });
  return NextResponse.json({ ok: r.count > 0 });
}
