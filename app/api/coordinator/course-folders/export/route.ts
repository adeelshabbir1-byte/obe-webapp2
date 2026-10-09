import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export const dynamic = "force-dynamic";

// GET ?courseId= : one Excel workbook that is the course folder: outline, CLOs, lecture plan, assessments, marks and attendance.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const courseId = req.nextUrl.searchParams.get("courseId") || "";
  const course = (await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true } })) as unknown as { id: string; code: string; title: string; creditHours: number; coordinatorId: string; subjectExpertId: string | null; instructorId: string | null; batch: { batchName: string; degreeProgram: string } | null } | null;
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });
  const lead = await prisma.user.findUnique({ where: { id: course.coordinatorId }, select: { managedById: true, departmentId: true } });
  const allowed = [course.coordinatorId, course.subjectExpertId, course.instructorId].includes(user.id)
    || (user.role === "CHAIRMAN" && lead?.managedById === user.id)
    || (["HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"].includes(user.role) && !!lead?.departmentId && lead.departmentId === user.departmentId);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [clos, lectures, instruments, marks, att] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" } as never, include: { mappedPlo: true } as never, orderBy: { code: "asc" } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" } as never, include: { clo: true } as never, orderBy: { lectureNumber: "asc" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId } as never, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    prisma.studentMark.findMany({ where: { courseId }, include: { student: { select: { name: true, rollNumber: true } } } as never }),
    prisma.attendanceRecord.groupBy({ by: ["studentId", "status"], where: { courseId }, _count: { _all: true } } as never),
  ]);
  type Cl = { code: string; statement: string; bloomLevel: string; mappedPlo: { number: number; title: string } | null };
  type Lr = { lectureNumber: number; week: number; topic: string; subtopic: string | null; clo: { code: string } | null; bloomLevel: string | null; actualDate: Date | null };
  type Ins = { id: string; type: string; label: string; marksPct: number; maxScore: number };
  type Mk = { instrumentId: string; score: number; student: { name: string; rollNumber: string } };
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; };
  const a = wb.addWorksheet("Course");
  a.addRows([["Code", course.code], ["Title", course.title], ["Credit hours", course.creditHours], ["Batch", course.batch ? `${course.batch.degreeProgram} ${course.batch.batchName}` : ""], ["Exported", new Date().toISOString().slice(0, 10)]]);
  a.getColumn(1).font = { bold: true }; a.getColumn(1).width = 16; a.getColumn(2).width = 60;
  const b = wb.addWorksheet("CLOs");
  b.addRow(["CLO", "Statement", "Bloom level", "Mapped PLO"]); head(b);
  for (const c of clos as unknown as Cl[]) b.addRow([c.code, c.statement, c.bloomLevel, c.mappedPlo ? `PLO-${c.mappedPlo.number} ${c.mappedPlo.title}` : "not mapped"]);
  b.columns = [{ width: 10 }, { width: 80 }, { width: 12 }, { width: 40 }];
  const l = wb.addWorksheet("Lecture plan");
  l.addRow(["Lecture", "Week", "Topic", "Subtopic", "CLO", "Bloom", "Held on"]); head(l);
  for (const r of lectures as unknown as Lr[]) l.addRow([r.lectureNumber, r.week, r.topic, r.subtopic || "", r.clo?.code || "", r.bloomLevel || "", r.actualDate ? r.actualDate.toISOString().slice(0, 10) : ""]);
  l.columns = [{ width: 9 }, { width: 7 }, { width: 45 }, { width: 40 }, { width: 9 }, { width: 8 }, { width: 12 }];
  const ins = (instruments as unknown as Ins[]);
  const s = wb.addWorksheet("Assessments");
  s.addRow(["Type", "Label", "% of course", "Out of"]); head(s);
  for (const i of ins) s.addRow([i.type, i.label, i.marksPct, i.maxScore]);
  s.columns = [{ width: 14 }, { width: 24 }, { width: 12 }, { width: 8 }];
  const m = wb.addWorksheet("Marks");
  m.addRow(["Roll number", "Student", ...ins.map((i) => `${i.label} (/${i.maxScore})`)]); head(m);
  const byStudent = new Map<string, { name: string; scores: Map<string, number> }>();
  for (const k of marks as unknown as Mk[]) { const e = byStudent.get(k.student.rollNumber) || { name: k.student.name, scores: new Map<string, number>() }; e.scores.set(k.instrumentId, k.score); byStudent.set(k.student.rollNumber, e); }
  for (const [roll, e] of Array.from(byStudent.entries()).sort()) m.addRow([roll, e.name, ...ins.map((i) => (e.scores.has(i.id) ? e.scores.get(i.id) : ""))]);
  m.columns = [{ width: 14 }, { width: 28 }];
  const t = wb.addWorksheet("Attendance");
  t.addRow(["Student id", "Present", "Absent", "Leave", "Attendance %"]); head(t);
  const att2 = new Map<string, Record<string, number>>();
  for (const r of att as unknown as { studentId: string; status: string; _count: { _all: number } }[]) att2.set(r.studentId, { ...(att2.get(r.studentId) || {}), [r.status]: r._count._all });
  const names = (await prisma.student.findMany({ where: { id: { in: Array.from(att2.keys()).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })) as unknown as { id: string; name: string; rollNumber: string }[];
  t.getRow(1).values = ["Roll number", "Student", "Present", "Absent", "Leave", "Attendance %"];
  for (const n of names.sort((x, y) => x.rollNumber.localeCompare(y.rollNumber))) { const c = att2.get(n.id) || {}; const p = c.PRESENT || 0, ab = c.ABSENT || 0, lv = c.LEAVE || 0; const tot = p + ab + lv; t.addRow([n.rollNumber, n.name, p, ab, lv, tot ? Math.round((p / tot) * 100) : ""]); }
  t.columns = [{ width: 14 }, { width: 28 }, { width: 9 }, { width: 9 }, { width: 8 }, { width: 14 }];
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${course.code.replace(/[^A-Za-z0-9_-]/g, "_")}-course-folder.xlsx"` } });
}
