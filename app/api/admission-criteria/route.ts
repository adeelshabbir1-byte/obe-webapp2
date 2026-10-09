import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { INSTITUTE_KEY, academicScope, programsOf } from "../../../lib/academic";

const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v: unknown) => (String(v ?? "").trim() || null);

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["CHAIRMAN", "STUDENT_AFFAIRS"].includes(user.role)) return NextResponse.json({ error: "Only the Student Affairs department (or the Institute Head) can set admission criteria" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const { chairmanId } = await academicScope(user);
  const scopeKey = String(b.scopeKey || "");
  if (!scopeKey) return NextResponse.json({ error: "Choose the faculty" }, { status: 400 });
  if (scopeKey !== INSTITUTE_KEY && !(await prisma.faculty.findFirst({ where: { id: scopeKey, chairmanId } }))) return NextResponse.json({ error: "Unknown faculty" }, { status: 400 });
  const degreeProgram = String(b.degreeProgram || "");
  if (!(await programsOf(chairmanId, scopeKey === INSTITUTE_KEY ? null : scopeKey)).includes(degreeProgram)) return NextResponse.json({ error: "That program is not in this faculty" }, { status: 400 });
  const pct = num(b.minPercentage);
  if (pct !== null && (pct < 0 || pct > 100)) return NextResponse.json({ error: "Minimum percentage must be between 0 and 100" }, { status: 400 });
  if (pct !== null && pct < 50) return NextResponse.json({ error: "NCEAC requires at least 50% marks in Intermediate for admission to a computing program" }, { status: 400 });
  const data = {
    academicYear: txt(b.academicYear), minPercentage: pct, requiredSubjects: txt(b.requiredSubjects), entryTest: txt(b.entryTest),
    minTestScore: num(b.minTestScore), seats: num(b.seats) === null ? null : Math.round(num(b.seats) as number),
    transferPolicy: txt(b.transferPolicy), otherConditions: txt(b.otherConditions), updatedById: user.id,
  };
  const row = await prisma.admissionCriteria.upsert({
    where: { chairmanId_scopeKey_degreeProgram: { chairmanId, scopeKey, degreeProgram } },
    create: { chairmanId, scopeKey, degreeProgram, ...data }, update: data,
  });
  await writeAuditLog({ actorUserId: user.id, action: "ADMISSION_CRITERIA_SET", entityType: "AdmissionCriteria", entityId: row.id });
  return NextResponse.json({ ok: true });
}
