import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// One-time repair for Lab courses created by split-lab (either the
// per-course button or the bulk "Split all 4-credit courses" one) BEFORE
// that endpoint was fixed to carry over isOffered/offeredTermName from the
// theory course it split off of. Those Lab rows were created with
// isOffered defaulting to false, making them invisible everywhere that
// only lists offered courses (Primary Instructor Assignment, Section
// Count Matrix, Program Semester Map, ...) even though their theory half
// was actively offered. Safe to run more than once — it only ever touches
// a Lab course whose own sibling theory course is offered and whose own
// isOffered is still false.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const labCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, courseType: "Lab", isOffered: false, code: { endsWith: "-L" } },
  });

  if (labCourses.length === 0) return NextResponse.json({ fixed: 0, fixedCodes: [] });

  const theoryCodes = labCourses.map((l) => l.code.slice(0, -2)); // strip "-L"
  const theoryCourses = await prisma.course.findMany({
    where: { coordinatorId: user.id, code: { in: theoryCodes }, isOffered: true },
  });
  const theoryByBatchCode = new Map(theoryCourses.map((t) => [`${t.batchId}|${t.code}`, t]));

  const fixedCodes: string[] = [];
  for (const lab of labCourses) {
    const theoryCode = lab.code.slice(0, -2);
    const theory = theoryByBatchCode.get(`${lab.batchId}|${theoryCode}`);
    if (!theory) continue; // no offered sibling found — leave it alone rather than guess
    await prisma.course.update({ where: { id: lab.id }, data: { isOffered: true, offeredTermName: theory.offeredTermName } });
    await writeAuditLog({ actorUserId: user.id, action: "COURSE_MANUALLY_OFFERED", entityType: "Course", entityId: lab.id, metadata: { via: "fix_lab_offering_repair" } });
    fixedCodes.push(lab.code);
  }

  return NextResponse.json({ fixed: fixedCodes.length, fixedCodes });
}
