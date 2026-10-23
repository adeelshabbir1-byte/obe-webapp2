import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { requireInstructorCourse } from "../../../lib/instructorGuard";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { notifyUsers } from "../../../lib/notifications";
import { writeAuditLog } from "../../../lib/audit";
import { vtdb, paperOf, systemCheck, aiCheck, type Vetting } from "../../../lib/paperVetting";
import { chairmanIdFor } from "../../../lib/reportScope";
import { checklistOf, repeatCheck, addRemark } from "../../../lib/moderation";

async function aiKey(chairmanId: string) {
  const c = (await vtdb.aiConfig.findUnique({ where: { chairmanId } }).catch(() => null)) as { enabled: boolean; apiKey: string | null; model: string } | null;
  return c?.enabled && c.apiKey ? { apiKey: c.apiKey, model: c.model } : process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" } : null;
}

// Teacher writes the questions, runs the system check (and the AI check when the institute has AI on) and sends the paper
// to the Program Lead; the Program Lead approves it or returns it with comments.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const examType = b.examType === "Final" ? "Final" : "Midterm";
  try {
    if (b.action === "decide") {
      const v = (await vtdb.paperVetting.findUnique({ where: { id: String(b.id || "") } })) as Vetting | null;
      const where = await reviewBatchWhere(user);
      const course = v ? await prisma.course.findFirst({ where: { id: v.courseId, ...(where ? { batch: where } : { id: "-" }) }, select: { id: true, code: true, instructorId: true } }) : null;
      if (!v || !course || !["CHAIRMAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEAN", "OMC", "DEPARTMENT_COORDINATOR"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      if (v.status !== "SUBMITTED") return NextResponse.json({ error: "This paper is not waiting for review." }, { status: 400 });
      const note = typeof b.note === "string" ? b.note.trim().slice(0, 3000) : "";
      if (!b.approve && !note) return NextResponse.json({ error: "Say what to improve." }, { status: 400 });
      await vtdb.paperVetting.update({ where: { id: v.id }, data: { status: b.approve ? "APPROVED" : "RETURNED", reviewerId: user.id, reviewNote: note || null, decidedAt: new Date() } });
      // The vetting checklist goes into the moderation log with the decision (lib/moderation.ts).
      try {
        const cl = checklistOf(v.systemJson, await repeatCheck(v.courseId, v.examType), typeof b.clarity === "boolean" ? b.clarity : null);
        await addRemark({ chairmanId: await chairmanIdFor(user), kind: "PAPER", courseId: v.courseId, examType: v.examType, round: v.round, byKind: "INTERNAL", byUserId: user.id, examinerId: null, decision: b.approve ? "APPROVED" : "RETURNED", comments: note || null, checklistJson: JSON.stringify(cl) });
      } catch { /* migration_moderation.sql not run yet */ }
      await notifyUsers([course.instructorId], { kind: "ASSIGNMENT", title: `${v.examType} paper ${b.approve ? "approved" : "returned"}: ${course.code}`, body: note || "Approved for use.", href: `/instructor/courses/${course.id}/paper-vetting?exam=${v.examType}` });
      await writeAuditLog({ actorUserId: user.id, action: b.approve ? "PAPER_APPROVED" : "PAPER_RETURNED", entityType: "PaperVetting", entityId: v.id, metadata: { courseId: course.id, examType: v.examType, round: v.round } });
      return NextResponse.json({ ok: true });
    }
    const course = await requireInstructorCourse(user, String(b.courseId || ""));
    if (!course) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let v = (await vtdb.paperVetting.findUnique({ where: { courseId_examType: { courseId: course.id, examType } } })) as Vetting | null;
    if (!v) v = (await vtdb.paperVetting.create({ data: { courseId: course.id, examType } })) as Vetting;
    if (v.status === "SUBMITTED" || v.status === "APPROVED") { if (b.action !== "reopen") return NextResponse.json({ error: v.status === "APPROVED" ? "The paper is approved. Reopen it to change it." : "The paper is with the Program Lead." }, { status: 400 }); }
    if (b.action === "reopen") { await vtdb.paperVetting.update({ where: { id: v.id }, data: { status: "DRAFT", round: v.round + 1 } }); return NextResponse.json({ ok: true }); }
    if (b.action === "save" || b.action === "check") {
      const qs: Record<string, string> = {};
      for (const [k, t] of Object.entries((b.questions || {}) as Record<string, unknown>)) if (typeof t === "string") qs[k] = t.slice(0, 4000);
      const sys = await systemCheck(course.id, examType);
      let ai: unknown = null, aiError = "";
      if (b.action === "check" && b.ai) {
        const key = await aiKey(await chairmanIdFor(user));
        if (!key) aiError = "AI checking is off: the Institute Head can turn it on under AI Configuration.";
        else {
          const { items, clos } = await paperOf(course.id, examType);
          const cOf = new Map(clos.map((c) => [c.id, c]));
          const list = items.filter((i) => (qs[i.id] || "").trim()).map((i) => ({ no: i.questionNo, text: qs[i.id], clo: (i.cloId && cOf.get(i.cloId)?.code) || "none", level: i.cognitiveLevel || "?", marks: i.marks }));
          if (!list.length) aiError = "Write the questions first; the AI reads their wording.";
          else { try { ai = await aiCheck(key, `${course.code} ${course.title}`, clos.map((c) => ({ code: c.code, statement: c.statement, bloomLevel: c.bloomLevel })), list); } catch (e) { aiError = e instanceof Error ? e.message : "AI check failed."; } }
        }
      }
      await vtdb.paperVetting.update({ where: { id: v.id }, data: { questionsJson: JSON.stringify(qs), teacherNote: typeof b.teacherNote === "string" ? b.teacherNote.slice(0, 3000) : v.teacherNote, systemJson: JSON.stringify({ ...sys, at: new Date() }), ...(ai ? { aiJson: JSON.stringify({ ...(ai as object), at: new Date() }) } : {}) } });
      return NextResponse.json({ ok: true, aiError });
    }
    if (b.action === "submit") {
      if (!v.systemJson) return NextResponse.json({ error: "Run the check first." }, { status: 400 });
      const sys = JSON.parse(v.systemJson) as { findings: { level: string }[] };
      if (sys.findings.some((x) => x.level === "fail")) return NextResponse.json({ error: "Fix the problems marked red before sending." }, { status: 400 });
      await vtdb.paperVetting.update({ where: { id: v.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
      const batch = course.batchId ? await prisma.batch.findUnique({ where: { id: course.batchId }, select: { coordinatorId: true } }) : null;
      await notifyUsers([batch?.coordinatorId], { kind: "ASSIGNMENT", title: `${examType} paper to vet: ${course.code}`, body: `${user.name} sent the ${examType.toLowerCase()} paper of ${course.code} ${course.title} for vetting.`, href: "/paper-vetting" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_paper_vetting.sql first." }, { status: 500 }); }
}
