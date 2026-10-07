import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor } from "../../../../lib/labAccess";
import { writeAuditLog } from "../../../../lib/audit";

// The lab's lead (the course instructor) brings the lab marks into their theory course's result, for institutes
// where the lab carries a share of the theory course's marks. The total of all lab sessions becomes the mark of one Lab item.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.labCourseId || !body.instrumentId) return NextResponse.json({ error: "choose the lab and the Lab item to fill" }, { status: 400 });
  const access = await labAccessFor(user, body.labCourseId);
  if (!access || access.as !== "LEAD") return NextResponse.json({ error: "only the lab's course instructor can import lab marks" }, { status: 403 });
  if (!access.theory || access.theory.instructorId !== user.id) return NextResponse.json({ error: "you can only import into a theory course that you teach" }, { status: 403 });

  const instrument = await prisma.assessmentInstrument.findFirst({ where: { id: body.instrumentId, courseId: access.theory.id, type: "Lab", source: "INSTRUCTOR" } });
  if (!instrument) return NextResponse.json({ error: "choose one of the Lab items of your theory course" }, { status: 404 });

  const marks = await prisma.labMark.findMany({ where: { courseId: access.lab.id } });
  if (marks.length === 0) return NextResponse.json({ error: "the Lab Engineer has not entered any marks yet" }, { status: 400 });
  // Each lab session counts at its own maximum; a student with no mark for a session scores 0 in it.
  const maxByLab = new Map<number, number>();
  for (const m of marks) maxByLab.set(m.labNumber, m.maxScore);
  const totalMax = Array.from(maxByLab.values()).reduce((a, b) => a + b, 0);
  const earned = new Map<string, number>();
  for (const m of marks) earned.set(m.studentId, (earned.get(m.studentId) || 0) + m.score);

  const theoryStudents = await prisma.studentEnrollment.findMany({ where: { courseId: access.theory.id, status: "ACTIVE" }, select: { studentId: true } });
  const inTheory = new Set<string>(theoryStudents.map((s) => s.studentId));
  let imported = 0, skipped = 0;
  for (const [studentId, got] of Array.from(earned.entries())) {
    if (!inTheory.has(studentId)) { skipped++; continue; }
    const score = Math.round((got / totalMax) * instrument.maxScore * 100) / 100;
    await prisma.studentMark.upsert({
      where: { studentId_instrumentId: { studentId, instrumentId: instrument.id } },
      create: { studentId, courseId: access.theory.id, instrumentId: instrument.id, score, enteredById: user.id },
      update: { score, enteredById: user.id },
    });
    imported++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_IMPORTED", entityType: "Course", entityId: access.theory.id, metadata: { labCourseId: access.lab.id, instrumentId: instrument.id, imported, skipped } });
  return NextResponse.json({ ok: true, imported, skipped });
}
