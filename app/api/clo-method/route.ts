import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { markFaulty, recalcPastTerms, requestCourse, saveItemMap, saveMethodSettings, saveType, saveWeights, setCloPart, voteCourse } from "../../../lib/cloMethods";
import { deptScope, programScope, respond, saveWarnSettings, setHeldOn, unlockLate } from "../../../lib/itemWarnings";

/**
 * POST { action, ... } — CLO attainment method and the rules around it.
 *  OMC:        settings { program, method, passPct, itemsPct, targetPct, levels, faultyAvgPct, labSharePct, labPassOn, labPassPct }
 *              recalc { program }  faulty { instrumentId, faulty, reason, noGrade }  type { … }  warnDept { departmentId, values }
 *  OMC member: vote { id, approve, reason }
 *  Program Lead: warnProgram { program, values | null }
 *  Course team (teacher, SE, Program Lead): item { courseId, source, instrumentId, … }  weights { courseId, source, cloId, weights }
 *              cloPart { courseId, cloId, part }  held { courseId, instrumentId, date }  request { courseId, kind, value, reason }
 *              respond { warningId, actions, note }
 */
const OMC_ROLES = ["OMC", "CHAIRMAN"];
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const omcOnly = () => { if (!OMC_ROLES.includes(user.role)) throw new Error("Only the OMC changes this."); };
  const team = async (courseId: string) => {
    const c = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, subjectExpertId: true, coordinatorId: true, labEngineerId: true, coordinator: { select: { managedById: true } } } });
    if (!c || ![c.instructorId, c.subjectExpertId, c.coordinatorId, c.labEngineerId].includes(user.id)) throw new Error("Only the course's teacher, Subject Expert or Program Lead changes this.");
    return c;
  };
  const src = (s: unknown) => (s === "SE" ? "SE" : "INSTRUCTOR") as "SE" | "INSTRUCTOR";
  try {
    switch (b.action) {
      case "settings": omcOnly(); await saveMethodSettings(user, chairmanId, String(b.program || ""), { method: b.method, passPct: b.passPct, itemsPct: b.itemsPct, targetPct: b.targetPct, faultyAvgPct: b.faultyAvgPct, labSharePct: b.labSharePct, labPassOn: b.labPassOn, labPassPct: b.labPassPct, ...(b.excellent ? { levels: { excellent: Number(b.excellent), good: Number(b.good), satisfactory: Number(b.satisfactory) } } : {}) }); return NextResponse.json({ ok: true });
      case "recalc": omcOnly(); return NextResponse.json({ ok: true, message: `Recalculated ${await recalcPastTerms(user, chairmanId, b.program || null)} locked term(s); both versions are kept.` });
      case "faulty": omcOnly(); await markFaulty(user, String(b.instrumentId || ""), { faulty: b.faulty !== false && b.faulty !== "false", reason: String(b.reason || b.note || ""), noGrade: b.noGrade === true || b.noGrade === "true" }); return NextResponse.json({ ok: true });
      case "type": omcOnly(); await saveType(chairmanId, { ...b, group: b.group === true || b.group === "true", graded: b.graded !== false && b.graded !== "false", defaultNotForClo: b.defaultNotForClo === true || b.defaultNotForClo === "true", ccp: b.ccp === true || b.ccp === "true", retired: b.retired === true || b.retired === "true" }); return NextResponse.json({ ok: true });
      case "warnDept": omcOnly(); await saveWarnSettings(user, chairmanId, deptScope(b.departmentId || null), b.values || b); return NextResponse.json({ ok: true });
      case "vote": { const v = await voteCourse(user, String(b.id || ""), b.approve === true || b.approve === "true", String(b.reason || b.note || "")); return NextResponse.json({ ok: true, message: v.line }); }
      case "warnProgram": {
        if (!["PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role)) throw new Error("Only the Program Lead sets his program's settings.");
        const program = String(b.program || "");
        if (!(await prisma.batch.count({ where: { coordinatorId: user.id, degreeProgram: program } }))) throw new Error("Choose one of your programs.");
        await saveWarnSettings(user, chairmanId, programScope(user.id, program), b.reset ? null : b.values || b);
        return NextResponse.json({ ok: true });
      }
      case "item": { await team(String(b.courseId)); await saveItemMap(user, String(b.courseId), src(b.source), String(b.instrumentId || ""), { splits: Array.isArray(b.splits) ? b.splits.map((s: { cloId: string; pct: unknown }) => ({ cloId: String(s.cloId), pct: Number(s.pct) })) : undefined, notForClo: b.notForClo === undefined ? undefined : b.notForClo === true || b.notForClo === "true", notForCloReason: b.notForCloReason, excluded: b.excluded === undefined ? undefined : b.excluded === true || b.excluded === "true", excludedReason: b.excludedReason, part: b.part, typeKey: b.typeKey }); return NextResponse.json({ ok: true }); }
      case "weights": { await team(String(b.courseId)); await saveWeights(user, String(b.courseId), src(b.source), String(b.cloId || ""), b.weights || {}); return NextResponse.json({ ok: true }); }
      case "cloPart": { await team(String(b.courseId)); await setCloPart(String(b.courseId), String(b.cloId || ""), b.part === "LAB" ? "LAB" : "THEORY"); return NextResponse.json({ ok: true }); }
      case "held": { await team(String(b.courseId)); const d = new Date(String(b.date || "")); if (isNaN(+d)) throw new Error("Choose the date it was held."); const due = await setHeldOn(String(b.courseId), String(b.instrumentId || ""), d); return NextResponse.json({ ok: true, message: `Marks due ${due.toISOString().slice(0, 10)}.` }); }
      case "request": { await team(String(b.courseId)); await requestCourse(user, String(b.courseId), b.kind === "LAB_SHARE" ? "LAB_SHARE" : "METHOD", { method: b.method, pct: Number(b.pct) }, String(b.reason || "")); return NextResponse.json({ ok: true, message: "Sent to the OMC (two approvals, or the course's panel)." }); }
      case "respond": { const id = await respond(user, String(b.warningId || ""), Array.isArray(b.actions) ? b.actions : Object.keys(b).filter((k) => b[k] === true), String(b.note || "")); return NextResponse.json({ ok: true, message: "Recorded on CQI Records.", cqiRecordId: id }); }
      case "labDefaults": case "labRow": {
        const { labAccessFor } = await import("../../../lib/labAccess");
        const access = await labAccessFor(user, String(b.labCourseId || ""));
        if (!access) throw new Error("Only the lab's engineer or lead edits the lab plan.");
        const ldb = prisma as unknown as Record<string, any>;
        if (b.action === "labDefaults") {
          const { saveTask } = await import("../../../lib/labPlan");
          const { defaultLabRows } = await import("../../../lib/cloMethodCore");
          if ((await ldb.labTaskPlan.count({ where: { labCourseId: access.lab.id } })) > 0) throw new Error("This lab plan already has rows.");
          for (const r of defaultLabRows()) {
            await saveTask(access.lab.id, access.theory?.id || null, { labNumber: r.labNumber, title: r.kind === "MID" ? "Lab mid" : r.kind === "FINAL" ? "Lab final" : `Lab ${r.labNumber}`, week: r.week, lectureNumbers: [] }, user.id);
            await ldb.labRowMeta.upsert({ where: { labCourseId_labNumber: { labCourseId: access.lab.id, labNumber: r.labNumber } }, create: { labCourseId: access.lab.id, labNumber: r.labNumber, hours: r.hours, kind: r.kind }, update: {} });
          }
          return NextResponse.json({ ok: true });
        }
        const labNumber = Math.round(Number(b.labNumber));
        const hours = Number(b.hours) > 0 && Number(b.hours) <= 8 ? Number(b.hours) : 3;
        const data = { hours, cloId: b.cloId || null, tools: String(b.tools || "").slice(0, 200) || null, deliverable: String(b.deliverable || "").slice(0, 200) || null, labOnly: b.labOnly === true || b.labOnly === "true", kind: ["MID", "FINAL"].includes(b.kind) ? b.kind : "TASK", aheadReason: String(b.aheadReason || "").slice(0, 500) || null, bestOf: String(b.bestOf || "").slice(0, 60) || null };
        await ldb.labRowMeta.upsert({ where: { labCourseId_labNumber: { labCourseId: access.lab.id, labNumber } }, create: { labCourseId: access.lab.id, labNumber, ...data }, update: data });
        return NextResponse.json({ ok: true });
      }
      case "practice": {
        await team(String(b.courseId));
        const ldb = prisma as unknown as Record<string, any>;
        const lr = await prisma.lectureRow.findFirst({ where: { id: String(b.lectureRowId || ""), courseId: String(b.courseId) }, select: { id: true } });
        if (!lr) throw new Error("Choose a lecture of this course.");
        await ldb.topicPractice.upsert({ where: { lectureRowId: lr.id }, create: { lectureRowId: lr.id, courseId: String(b.courseId), needsPractice: b.needsPractice === true || b.needsPractice === "true" }, update: { needsPractice: b.needsPractice === true || b.needsPractice === "true" } });
        return NextResponse.json({ ok: true });
      }
      case "unlock": { if (!["HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN"].includes(user.role)) throw new Error("Only the HOD unlocks late marks."); await unlockLate(user, String(b.instrumentId || ""), String(b.reason || b.note || "")); return NextResponse.json({ ok: true }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
