import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { chairmanIdFor } from "../../../lib/reportScope";
import { cdb, ATTRS, EA_ATTRS, KNOWLEDGE } from "../../../lib/complexProblems";
import { withErrors } from "../../../lib/apiHandler";

const EDIT = ["CHAIRMAN", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "OMC", "DEPARTMENT_COORDINATOR"];

// Program Lead (or the course's instructor for tags): mark assessments as complex problems; map course codes to knowledge areas.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const where = await reviewBatchWhere(user);
  try {
    if (b.action === "tag") {
      const inst = await prisma.assessmentInstrument.findUnique({ where: { id: String(b.instrumentId || "") }, select: { id: true, courseId: true, course: { select: { instructorId: true, batchId: true } } } });
      const ok = inst && (inst.course.instructorId === user.id || (where && EDIT.includes(user.role) && (await prisma.course.count({ where: { id: inst.courseId, batch: where } }))));
      if (!inst || !ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      // Attributes (P1–P7, EA1–EA5) and the knowledge areas the assessment draws on (WK / CK), kept together.
      const attrs = [...[...ATTRS, ...EA_ATTRS].map(([k]) => k).filter((k) => b[`a_${k}`]), ...[...KNOWLEDGE.PEC, ...KNOWLEDGE.NCEAC].map(([k]) => k).filter((k) => b[`k_${k}`])];
      if (!attrs.length) { await cdb.complexTag.deleteMany({ where: { instrumentId: inst.id } }); return NextResponse.json({ ok: true }); }
      if (attrs.some((k) => k.startsWith("P")) && !attrs.includes("P1")) return NextResponse.json({ error: "A complex problem must require depth of knowledge (P1)." }, { status: 400 });
      const data = { courseId: inst.courseId, attrsJson: JSON.stringify(attrs), note: typeof b.note === "string" ? b.note.slice(0, 2000) : null };
      await cdb.complexTag.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...data }, update: data });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "target") {
      // A final year project group (FYP) or a lab task (LAB, ref "<labCourseId>:<labNumber>") as a complex problem.
      if (!where || !EDIT.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const kind = b.kind === "FYP" ? "FYP" : b.kind === "LAB" ? "LAB" : null;
      const refId = String(b.refId || "").slice(0, 120);
      if (!kind || !refId) return NextResponse.json({ error: "Choose what to tag." }, { status: 400 });
      const cid = await chairmanIdFor(user);
      let courseId: string | null = null;
      if (kind === "LAB") {
        courseId = refId.split(":")[0];
        if (!(await prisma.course.count({ where: { id: courseId, batch: where } }))) return NextResponse.json({ error: "Lab not found." }, { status: 404 });
      } else {
        const g = await prisma.fypGroup.findUnique({ where: { id: refId }, select: { cycleId: true } });
        const cyc = g && (await prisma.fypCycle.findUnique({ where: { id: g.cycleId }, select: { chairmanId: true } }));
        if (!cyc || cyc.chairmanId !== cid) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      }
      const attrs = [...[...ATTRS, ...EA_ATTRS].map(([k]) => k).filter((k) => b[`a_${k}`]), ...[...KNOWLEDGE.PEC, ...KNOWLEDGE.NCEAC].map(([k]) => k).filter((k) => b[`k_${k}`])];
      if (attrs.some((k) => /^P\d$/.test(k)) && !attrs.includes("P1")) return NextResponse.json({ error: "A complex problem must require depth of knowledge (P1)." }, { status: 400 });
      const note = typeof b.note === "string" ? b.note.slice(0, 2000) : null;
      if (!attrs.length) await cdb.complexTarget.deleteMany({ where: { kind, refId } });
      else await cdb.complexTarget.upsert({ where: { kind_refId: { kind, refId } }, create: { id: randomUUID(), chairmanId: cid, kind, refId, courseId, attrsJson: JSON.stringify(attrs), note, updatedById: user.id }, update: { attrsJson: JSON.stringify(attrs), note, updatedById: user.id, updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "COMPLEX_PROBLEM_TAGGED", entityType: "ComplexTarget", entityId: refId, metadata: { kind, attrs: attrs.length } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "knowledge") {
      if (!where || !EDIT.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const code = String(b.courseCode || "").slice(0, 40);
      if (!code || !(await prisma.course.count({ where: { code, batch: where } }))) return NextResponse.json({ error: "Course not found." }, { status: 404 });
      const all = [...KNOWLEDGE.PEC, ...KNOWLEDGE.NCEAC].map(([k]) => k);
      const areas = all.filter((k) => b[`k_${k}`]);
      const cid = await chairmanIdFor(user);
      await cdb.courseKnowledge.upsert({ where: { chairmanId_courseCode: { chairmanId: cid, courseCode: code } }, create: { chairmanId: cid, courseCode: code, areasJson: JSON.stringify(areas) }, update: { areasJson: JSON.stringify(areas) } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: b.action === "target" ? "Run prisma/migration_complex_profiles.sql first." : "Run prisma/migration_teaching_extras.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
