import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { financeScope, recentFiscalYears } from "../../../../../lib/resources";
import { SCHOLARSHIP_SCHEMES } from "../../../../../lib/accounts";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };

// Fee structure (per program and intake session) and scholarships (per fiscal year): Finance Officer and Institute Head.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const scope = user ? financeScope(user) : null;
  if (!user || !scope?.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.entity === "fee") {
      const degreeProgram = str(b.degreeProgram, 120), session = str(b.session, 20);
      if (!degreeProgram || !/^\d{4}(-\d{2})?$/.test(session)) return NextResponse.json({ error: "Choose the program and the intake session (e.g. 2025-26)." }, { status: 400 });
      const data = {
        admissionFee: money(b.admissionFee), tuitionPerSemester: money(b.tuitionPerSemester), perCreditHour: b.perCreditHour === "" || b.perCreditHour === null || b.perCreditHour === undefined ? null : money(b.perCreditHour),
        labFee: money(b.labFee), examFee: money(b.examFee), otherFee: money(b.otherFee), notes: str(b.notes, 500) || null, updatedById: user.id,
      };
      const row = await prisma.feeStructure.upsert({ where: { chairmanId_degreeProgram_session: { chairmanId: scope.chairmanId, degreeProgram, session } }, create: { chairmanId: scope.chairmanId, degreeProgram, session, ...data }, update: data });
      await writeAuditLog({ actorUserId: user.id, action: "FEE_STRUCTURE_SAVED", entityType: "FeeStructure", entityId: row.id, metadata: { degreeProgram, session } });
      return NextResponse.json({ fee: row });
    }
    if (b.entity === "scholarship") {
      const fiscalYear = str(b.fiscalYear, 10);
      if (!recentFiscalYears(8).includes(fiscalYear)) return NextResponse.json({ error: "Choose a fiscal year." }, { status: 400 });
      const scheme = SCHOLARSHIP_SCHEMES.includes(b.scheme) ? b.scheme : str(b.scheme, 120) || "Other";
      const students = Math.max(0, Math.round(Number(b.students) || 0));
      const data = { fiscalYear, scheme, degreeProgram: str(b.degreeProgram, 120) || null, students, amount: money(b.amount), notes: str(b.notes, 500) || null, updatedById: user.id };
      const id = str(b.id, 60);
      const row = id ? await prisma.scholarshipRecord.update({ where: { id, chairmanId: scope.chairmanId }, data }) : await prisma.scholarshipRecord.create({ data: { chairmanId: scope.chairmanId, ...data } });
      await writeAuditLog({ actorUserId: user.id, action: "SCHOLARSHIP_SAVED", entityType: "ScholarshipRecord", entityId: row.id, metadata: { fiscalYear, scheme } });
      return NextResponse.json({ scholarship: row });
    }
    return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  } catch (e) {
    if (String((e as Error)?.message || "").includes("does not exist")) return NextResponse.json({ error: "The fee and scholarship tables are not in the database yet — run prisma/migration_oct2026_features.sql in Supabase." }, { status: 500 });
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const scope = user ? financeScope(user) : null;
  if (!user || !scope?.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const entity = req.nextUrl.searchParams.get("entity"), id = req.nextUrl.searchParams.get("id") || "";
  if (entity === "fee") await prisma.feeStructure.deleteMany({ where: { id, chairmanId: scope.chairmanId } });
  else if (entity === "scholarship") await prisma.scholarshipRecord.deleteMany({ where: { id, chairmanId: scope.chairmanId } });
  else return NextResponse.json({ error: "unknown entity" }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "ACCOUNTS_RECORD_REMOVED", entityType: entity, entityId: id });
  return NextResponse.json({ ok: true });
}
