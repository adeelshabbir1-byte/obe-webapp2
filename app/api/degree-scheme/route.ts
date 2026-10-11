import { NextRequest, NextResponse } from "next/server";
import { schemeAccess, loadScheme, changeScheme } from "../../../lib/degreeScheme";
import { writeAuditLog } from "../../../lib/audit";

// GET ?studentId=  : the student's full degree scheme (the student themself may omit studentId).
// POST { studentId?, action: "move" | "retake" | "grade" | "cancel", courseId, semesterNumber?, grade? }
export async function GET(req: NextRequest) {
  const access = await schemeAccess(req.nextUrl.searchParams.get("studentId"));
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const s = await loadScheme(access.studentId);
  if (!s) return NextResponse.json({ error: "student not found" }, { status: 404 });
  return NextResponse.json({ ...s, editedBy: access.by });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const access = await schemeAccess(b.studentId ? String(b.studentId) : null);
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  // Several target grades at once ("apply suggested grades").
  if (b.action === "grades" && Array.isArray(b.grades)) {
    for (const g of b.grades.slice(0, 80)) {
      const x = await changeScheme(access.studentId, "grade", String(g.courseId || ""), { grade: g.grade ?? null });
      if ("error" in x) return NextResponse.json({ error: x.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }
  const r = await changeScheme(access.studentId, String(b.action || ""), String(b.courseId || ""), { semesterNumber: b.semesterNumber, grade: b.grade ?? null });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  if (access.by === "staff") await writeAuditLog({ actorUserId: access.actorId, action: `DEGREE_PLAN_${String(b.action).toUpperCase()}`, entityType: "Student", entityId: access.studentId, metadata: { courseId: String(b.courseId), semester: Number(b.semesterNumber) || 0 } });
  return NextResponse.json(r);
}
