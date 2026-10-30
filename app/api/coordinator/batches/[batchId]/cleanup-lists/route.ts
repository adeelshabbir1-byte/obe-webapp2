import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { deleteCourseCompletely } from "../../../../../../lib/deleteCourseCompletely";
import { LIST_TYPES } from "../../../../../../lib/autoCopyPreviousBatch";
import { retypeListCourses } from "../../../../../../lib/listCourses";
import { withErrors } from "../../../../../../lib/apiHandler";

// POST — remove the Elective / IDS list courses a batch got by importing a whole curriculum (a pool to choose from, not
// studied as such): only those with no students, marks or attendance. Filled elective slots are untouched.
async function POST_handler(_req: Request, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batch = await prisma.batch.findFirst({ where: { id: params.batchId, coordinatorId: user.id } });
  if (!batch) return NextResponse.json({ error: "Not your batch." }, { status: 404 });
  await retypeListCourses(batch.id); // older imports: find the list options first
  const cs = await prisma.course.findMany({ where: { batchId: batch.id, courseType: { in: LIST_TYPES } }, select: { id: true, _count: { select: { studentEnrollments: true, studentMarks: true, attendanceRecords: true } } } });
  const free = cs.filter((c) => !c._count.studentEnrollments && !c._count.studentMarks && !c._count.attendanceRecords);
  let removed = 0;
  for (const c of free) { try { await deleteCourseCompletely(c.id); removed++; } catch { /* keep going */ } }
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_LIST_COURSES_REMOVED", entityType: "Batch", entityId: batch.id, metadata: { removed, kept: cs.length - removed } });
  return NextResponse.json({ ok: true, message: `Removed ${removed} elective-list course(s).${cs.length - removed ? ` ${cs.length - removed} kept (students, marks or attendance).` : ""}` });
}
export const POST = withErrors(POST_handler);
