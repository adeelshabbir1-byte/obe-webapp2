import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { academicRules, saveRules, canSetRulesNow, setExamController, DEFAULT_RULES, RULES_HINT, type AcademicRules } from "../../../lib/academicRules";
import { runAutoRegistration } from "../../../lib/autoRegister";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 60;

// POST { action: "save", ...limits } | { action: "controller", userId } (Institute Head) | { action: "register" }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true } });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  const setter = await canSetRulesNow({ id: user.id, role: user.role, extraRoles: me?.extraRoles }, chairmanId);
  try {
    if (b.action === "save") {
      if (!setter) return NextResponse.json({ error: "Only the Controller of Examinations (or the Dean acting as Controller while none is named) sets these." }, { status: 403 });
      const cur = await academicRules(chairmanId);
      const r = { ...cur } as AcademicRules;
      for (const k of Object.keys(DEFAULT_RULES) as (keyof AcademicRules)[]) if (b[k] !== undefined && b[k] !== "") { const v = Number(b[k]); if (!isNaN(v)) r[k] = v; }
      if (!(r.probationCgpa <= r.warningCgpa && r.dismissCgpa <= r.probationCgpa && r.warningCgpa <= 4 && r.dismissCgpa >= 0)) return NextResponse.json({ error: "Limits must go: dismissal ≤ probation ≤ warning ≤ 4.00." }, { status: 400 });
      if (r.minAttendanceForExam < 0 || r.minAttendanceForExam > 100) return NextResponse.json({ error: "Attendance is a percentage." }, { status: 400 });
      await saveRules(chairmanId, r, user.id);
      await writeAuditLog({ actorUserId: user.id, action: "ACADEMIC_RULES_SAVED", entityType: "AcademicRule", entityId: chairmanId, metadata: r });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "controller") {
      if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head names the Controller of Examinations." }, { status: 403 });
      await setExamController(chairmanId, b.userId || null);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "register") {
      if (!setter && !["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "OMC"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const r = await runAutoRegistration(chairmanId, user.role === "PROGRAM_COORDINATOR" ? { batchIds: (await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { id: true } })).map((x) => x.id) } : {});
      return NextResponse.json({ ok: true, message: `${r.registered} registration(s) made; ${r.fromPlan} low-CGPA student(s) registered from their advisor's plan; ${r.held} student(s) held for their advisor.` });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) { console.error("academic-rules", e); return NextResponse.json({ error: RULES_HINT }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
