import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { chairmanIdFor } from "../../../lib/reportScope";
import { cdb, ATTRS, KNOWLEDGE } from "../../../lib/complexProblems";

const EDIT = ["CHAIRMAN", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "OMC", "DEPARTMENT_COORDINATOR"];

// Program Lead (or the course's instructor for tags): mark assessments as complex problems; map course codes to knowledge areas.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const where = await reviewBatchWhere(user);
  try {
    if (b.action === "tag") {
      const inst = await prisma.assessmentInstrument.findUnique({ where: { id: String(b.instrumentId || "") }, select: { id: true, courseId: true, course: { select: { instructorId: true, batchId: true } } } });
      const ok = inst && (inst.course.instructorId === user.id || (where && EDIT.includes(user.role) && (await prisma.course.count({ where: { id: inst.courseId, batch: where } }))));
      if (!inst || !ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const attrs = ATTRS.map(([k]) => k).filter((k) => b[`a_${k}`]);
      if (!attrs.length) { await cdb.complexTag.deleteMany({ where: { instrumentId: inst.id } }); return NextResponse.json({ ok: true }); }
      if (!attrs.includes("P1")) return NextResponse.json({ error: "A complex problem must require depth of knowledge (P1)." }, { status: 400 });
      const data = { courseId: inst.courseId, attrsJson: JSON.stringify(attrs), note: typeof b.note === "string" ? b.note.slice(0, 2000) : null };
      await cdb.complexTag.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...data }, update: data });
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
  } catch { return NextResponse.json({ error: "Run prisma/migration_teaching_extras.sql first." }, { status: 500 }); }
}
