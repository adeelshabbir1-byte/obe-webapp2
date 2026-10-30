import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor, loadLabCourse } from "../../../../lib/labAccess";
import { reviewBatchWhere } from "../../../../lib/reviewScope";
import { resultLockMessage } from "../../../../lib/resultApproval";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { labSetting, saveLabSetting, ensureLabItem, removeLabItem, LAB_THEORY_HINT } from "../../../../lib/labTheory";
import { recomputeCourseRows } from "../../../../lib/lectureWeights";
import { POST as importLabMarks } from "../import/route";
import { withErrors } from "../../../../lib/apiHandler";

/**
 * POST { labCourseId, action }
 *   setting { intoTheory, weightPct } — the theory instructor, the Program Lead or the HOD: do the lab's marks go into the theory result?
 *   approve — the theory instructor: bring the lab marks into the theory course's Lab assessment and lock them
 *   reopen  — the theory instructor: unlock the lab marks so the Lab Engineer can correct them
 *   request { reason } — the Lab Engineer: ask the theory instructor to reopen approved marks
 */
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const labCourseId = String(b.labCourseId || "");
  const loaded = await loadLabCourse(labCourseId);
  if (!loaded) return NextResponse.json({ error: "Lab not found." }, { status: 404 });
  const { lab, theory, lead } = loaded;
  const access = await labAccessFor(user, labCourseId);
  const where = await reviewBatchWhere(user);
  const isManager = lab.coordinatorId === user.id || (!!where && ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role) && !!lab.batchId && (await prisma.batch.count({ where: { AND: [{ id: lab.batchId }, where] } })) > 0);
  const isLead = access?.as === "LEAD" && (!theory || theory.instructorId === user.id || lab.instructorId === user.id);
  try {
    const s = await labSetting(labCourseId);
    if (!s.ready) return NextResponse.json({ error: LAB_THEORY_HINT }, { status: 500 });

    if (b.action === "setting") {
      if (!isLead && !isManager) return NextResponse.json({ error: "Only the theory instructor, the Program Lead or the HOD can change this." }, { status: 403 });
      if (!theory) return NextResponse.json({ error: "No theory course was found for this lab (its code should be the theory code followed by -L)." }, { status: 400 });
      const intoTheory = !!b.intoTheory;
      const weightPct = Math.min(Math.max(Number(b.weightPct) || s.weightPct || 20, 5), 50);
      if (!intoTheory && s.intoTheory && s.instrumentId) { const locked = await resultLockMessage(theory.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); await removeLabItem(s); await recomputeCourseRows(theory.id, "INSTRUCTOR").catch(() => null); }
      await saveLabSetting(labCourseId, { theoryCourseId: theory.id, intoTheory, weightPct, ...(intoTheory ? {} : { instrumentId: null, oldWeightsJson: null, approvedAt: null, approvedById: null }), updatedById: user.id });
      await writeAuditLog({ actorUserId: user.id, action: "LAB_THEORY_SETTING", entityType: "Course", entityId: labCourseId, metadata: { intoTheory, weightPct } });
      await notifyUsers([lead?.id, lab.labEngineer?.id, lab.coordinatorId], { kind: "LAB_THEORY", title: `${lab.code}: lab marks ${intoTheory ? `go into ${theory.code} (${weightPct}%)` : "stay a separate course"}`, href: `/lab-engineer/labs/${lab.id}`, exceptId: user.id });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "approve") {
      if (!isLead || !theory) return NextResponse.json({ error: "Only the theory instructor approves the lab marks." }, { status: 403 });
      if (!s.intoTheory) return NextResponse.json({ error: "Turn on “Lab marks go into the theory result” first." }, { status: 400 });
      const locked = await resultLockMessage(theory.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 });
      if (!(await prisma.labMark.count({ where: { courseId: lab.id } }))) return NextResponse.json({ error: "The Lab Engineer has not entered any lab marks yet." }, { status: 400 });
      const item = await ensureLabItem(theory.id, lab.code, s.weightPct, s);
      // The existing import fills the Lab item (split by the lab sessions' CLOs) from the lab marks.
      const res = await importLabMarks(new NextRequest(new URL("/api/lab/import", req.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" }, body: JSON.stringify({ labCourseId: lab.id, instrumentId: item.id }) }));
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return NextResponse.json({ error: d.error || "Could not bring the lab marks in." }, { status: res.status });
      await recomputeCourseRows(theory.id, "INSTRUCTOR").catch(() => null);
      await saveLabSetting(labCourseId, { instrumentId: item.id, approvedAt: new Date(), approvedById: user.id, changeRequest: null, changeRequestedAt: null, updatedById: user.id });
      await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_APPROVED", entityType: "Course", entityId: theory.id, metadata: { labCourseId: lab.id, imported: d.imported || 0, created: item.created, scaled: item.scaled } });
      await notifyUsers([lab.labEngineer?.id], { kind: "LAB_THEORY", title: `${lab.code}: lab marks approved into ${theory.code} and locked`, body: "Ask the theory instructor if a mark needs changing.", href: `/lab-engineer/labs/${lab.id}`, exceptId: user.id });
      return NextResponse.json({ ok: true, imported: d.imported || 0, created: item.created, scaled: item.scaled });
    }

    if (b.action === "reopen") {
      if (!isLead) return NextResponse.json({ error: "Only the theory instructor can reopen the lab marks." }, { status: 403 });
      await saveLabSetting(labCourseId, { approvedAt: null, approvedById: null, changeRequest: null, changeRequestedAt: null, updatedById: user.id });
      await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_REOPENED", entityType: "Course", entityId: labCourseId, metadata: { reason: String(b.reason || "").slice(0, 200) } });
      await notifyUsers([lab.labEngineer?.id], { kind: "LAB_THEORY", title: `${lab.code}: lab marks reopened — correct them, then the theory instructor approves again`, href: `/lab-engineer/labs/${lab.id}`, exceptId: user.id });
      return NextResponse.json({ ok: true });
    }

    if (b.action === "request") {
      if (access?.as !== "ENGINEER") return NextResponse.json({ error: "Only the Lab Engineer asks for a change." }, { status: 403 });
      const reason = String(b.reason || "").trim().slice(0, 1000);
      if (!reason) return NextResponse.json({ error: "Say which marks need changing and why." }, { status: 400 });
      await saveLabSetting(labCourseId, { changeRequest: reason, changeRequestedAt: new Date(), updatedById: user.id });
      await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_CHANGE_REQUESTED", entityType: "Course", entityId: labCourseId, metadata: { length: reason.length } });
      await notifyUsers([lead?.id], { kind: "LAB_THEORY", title: `${lab.code}: the Lab Engineer asks to change approved lab marks`, body: reason.slice(0, 200), href: `/lab-engineer/labs/${lab.id}`, exceptId: user.id });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? LAB_THEORY_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
