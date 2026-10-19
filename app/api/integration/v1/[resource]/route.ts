import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { chairmanOfKey } from "../../../../../lib/integrationKeys";
import { writeAuditLog } from "../../../../../lib/audit";

// Campus management system → OBEHUB. Authorization: Bearer <institute API key>. JSON bodies, up to 2,000 rows a call.
//   POST /api/integration/v1/students   { batch: { program, name }, students: [{ roll, name, status? }] }
//        adds new roll numbers to the batch and updates names / status of existing ones.
//   POST /api/integration/v1/enrolments { courseCode, batch: { program, name }, rolls: [..] }   (offered course of that batch)
//   POST /api/integration/v1/marks      { courseCode, batch: { program, name }, assessment: "Quiz 1", marks: [{ roll, score }] }
//   GET  /api/integration/v1/courses    — offered courses with their assessments (labels and max marks)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
type Row = Record<string, unknown>;
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function batchOf(chairmanId: string, b: Row | undefined) {
  const program = str(b?.program), name = str(b?.name);
  if (!program || !name) return null;
  return prisma.batch.findFirst({ where: { degreeProgram: program, batchName: name, coordinator: { managedById: chairmanId } }, select: { id: true, coordinatorId: true } });
}

export async function GET(req: NextRequest, { params }: { params: { resource: string } }) {
  const chairmanId = await chairmanOfKey(req.headers.get("authorization"));
  if (!chairmanId) return bad("invalid API key", 401);
  if (params.resource !== "courses") return bad("unknown resource", 404);
  const courses = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: chairmanId } }, select: { code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } }, assessmentInstruments: { where: { source: "INSTRUCTOR" }, select: { label: true, type: true, maxScore: true, marksPct: true } } }, take: 3000 });
  return NextResponse.json({ courses: courses.map((c) => ({ code: c.code, title: c.title, batch: c.batch ? { program: c.batch.degreeProgram, name: c.batch.batchName } : null, assessments: c.assessmentInstruments })) });
}

export async function POST(req: NextRequest, { params }: { params: { resource: string } }) {
  const chairmanId = await chairmanOfKey(req.headers.get("authorization"));
  if (!chairmanId) return bad("invalid API key", 401);
  const body = (await req.json().catch(() => null)) as Row | null;
  if (!body) return bad("JSON body expected");
  const batch = await batchOf(chairmanId, body.batch as Row);
  if (!batch) return bad("batch { program, name } not found");
  let created = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  if (params.resource === "students") {
    const rows = (Array.isArray(body.students) ? body.students : []).slice(0, 2000) as Row[];
    for (const r of rows) {
      const roll = str(r.roll, 40), name = str(r.name, 120);
      if (!roll || !name) { skipped++; continue; }
      const ex = await prisma.student.findFirst({ where: { rollNumber: roll, batchId: batch.id } });
      const status = ["ACTIVE", "GRADUATED", "LEFT", "DROPPED"].includes(str(r.status)) ? str(r.status) : undefined;
      if (ex) { await prisma.student.update({ where: { id: ex.id }, data: { name, ...(status ? { status } : {}) } as never }); updated++; }
      else {
        try { await prisma.student.create({ data: { rollNumber: roll, name, batchId: batch.id, ...(status ? { status } : {}) } as never }); created++; }
        catch (e) { skipped++; errors.push(`${roll}: ${String((e as Error).message).slice(0, 120)}`); }
      }
    }
  } else if (params.resource === "enrolments" || params.resource === "marks") {
    const course = await prisma.course.findFirst({ where: { code: str(body.courseCode, 30), batchId: batch.id } });
    if (!course) return bad("course not found in that batch");
    const students = new Map((await prisma.student.findMany({ where: { batchId: batch.id }, select: { id: true, rollNumber: true } })).map((s) => [s.rollNumber, s.id]));
    if (params.resource === "enrolments") {
      for (const roll of ((Array.isArray(body.rolls) ? body.rolls : []) as unknown[]).slice(0, 2000)) {
        const sid = students.get(str(roll, 40));
        if (!sid) { skipped++; continue; }
        const ex = await prisma.studentEnrollment.findFirst({ where: { studentId: sid, courseId: course.id } });
        if (ex) { updated++; continue; }
        await prisma.studentEnrollment.create({ data: { studentId: sid, courseId: course.id } }); created++;
      }
    } else {
      const inst = await prisma.assessmentInstrument.findFirst({ where: { courseId: course.id, source: "INSTRUCTOR", label: str(body.assessment, 120) } });
      if (!inst) return bad("assessment not found — GET /courses lists the labels");
      for (const r of ((Array.isArray(body.marks) ? body.marks : []) as Row[]).slice(0, 2000)) {
        const sid = students.get(str(r.roll, 40));
        const score = Number(r.score);
        if (!sid || !Number.isFinite(score) || score < 0 || score > inst.maxScore) { skipped++; continue; }
        const ex = await prisma.studentMark.findFirst({ where: { studentId: sid, instrumentId: inst.id } });
        if (ex) { await prisma.studentMark.update({ where: { id: ex.id }, data: { score } }); updated++; }
        else { await prisma.studentMark.create({ data: { studentId: sid, courseId: course.id, instrumentId: inst.id, score, enteredById: course.instructorId || batch.coordinatorId } }); created++; }
      }
    }
  } else return bad("unknown resource", 404);
  await writeAuditLog({ action: `INTEGRATION_${params.resource.toUpperCase()}`, entityType: "Batch", entityId: batch.id, metadata: { created, updated, skipped } });
  return NextResponse.json({ created, updated, skipped, errors: errors.slice(0, 20) });
}
