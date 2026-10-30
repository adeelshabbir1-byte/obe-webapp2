import { NextRequest, NextResponse } from "next/server";
import { schemeAccess, loadScheme, changeScheme } from "../../../lib/degreeScheme";
import { writeAuditLog } from "../../../lib/audit";
import { prisma } from "../../../lib/db";
import { planLock, registerFromPlan } from "../../../lib/registrationRules";
import { snapshot } from "../../../lib/planHistory";
import { withErrors } from "../../../lib/apiHandler";

const db = prisma as unknown as Record<string, any>;

// GET ?studentId=  : the student's full degree scheme (the student themself may omit studentId).
// POST { studentId?, action: "move" | "retake" | "grade" | "cancel", courseId, semesterNumber?, grade? }
async function GET_handler(req: NextRequest) {
  const access = await schemeAccess(req.nextUrl.searchParams.get("studentId"));
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const s = await loadScheme(access.studentId);
  if (!s) return NextResponse.json({ error: "student not found" }, { status: 404 });
  return NextResponse.json({ ...s, editedBy: access.by });
}

async function POST_handler(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const access = await schemeAccess(b.studentId ? String(b.studentId) : null);
  if (!access) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  // Lock / unlock the plan and register from it: advisor and program staff only.
  if (["lock", "unlock", "register"].includes(String(b.action))) {
    if (access.by !== "staff") return NextResponse.json({ error: "Only the advisor or the Program Lead can do this." }, { status: 403 });
    if (b.action === "lock") await db.degreePlanLock.upsert({ where: { studentId: access.studentId }, update: { lockedById: access.actorId, note: b.note ? String(b.note).slice(0, 500) : null, lockedAt: new Date() }, create: { studentId: access.studentId, lockedById: access.actorId, note: b.note ? String(b.note).slice(0, 500) : null } });
    if (b.action === "unlock") await db.degreePlanLock.deleteMany({ where: { studentId: access.studentId } });
    if (b.action === "lock" || b.action === "unlock") await snapshot(access.studentId, access.actorId, b.action === "lock" ? "LOCK" : "UNLOCK", b.note ? String(b.note).slice(0, 500) : null, b.reason ? String(b.reason) : null);
    let result: unknown = { ok: true };
    if (b.action === "register") result = await registerFromPlan(access.studentId);
    await writeAuditLog({ actorUserId: access.actorId, action: `DEGREE_PLAN_${String(b.action).toUpperCase()}`, entityType: "Student", entityId: access.studentId });
    return NextResponse.json(result);
  }
  // A locked plan can't be rearranged by the student (target grades for what-if stay free).
  if (access.by === "student" && ["move", "retake", "cancel"].includes(String(b.action)) && (await planLock(access.studentId))) {
    return NextResponse.json({ error: "Your advisor has locked your degree plan. Ask your advisor to change it." }, { status: 403 });
  }
  // Several target grades at once ("apply suggested grades").
  if (b.action === "grades" && Array.isArray(b.grades)) {
    for (const g of b.grades.slice(0, 80)) {
      const x = await changeScheme(access.studentId, "grade", String(g.courseId || ""), { grade: g.grade ?? null });
      if ("error" in x) return NextResponse.json({ error: x.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }
  const r = await changeScheme(access.studentId, String(b.action || ""), String(b.courseId || ""), { semesterNumber: b.semesterNumber, grade: b.grade ?? null }, { kind: access.by, id: access.actorId });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  if (access.by === "staff") await writeAuditLog({ actorUserId: access.actorId, action: `DEGREE_PLAN_${String(b.action).toUpperCase()}`, entityType: "Student", entityId: access.studentId, metadata: { courseId: String(b.courseId), semester: Number(b.semesterNumber) || 0 } });
  return NextResponse.json(r);
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
