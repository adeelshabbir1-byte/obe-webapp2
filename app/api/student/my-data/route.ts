import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { withErrors } from "../../../../lib/apiHandler";

const sdb = prisma as unknown as Record<string, any>;

// A student's own data, on request (data-protection right of access): profile, enrolments, marks, attendance, grades,
// fees, notices — as one JSON file. Passwords and other people's data are never included.
async function GET_handler() {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = st.id;
  const safe = async (f: () => Promise<unknown>) => { try { return await f(); } catch { return null; } };
  const out = {
    exportedAt: new Date().toISOString(),
    student: await prisma.student.findUnique({ where: { id }, select: { name: true, rollNumber: true, status: true, currentSemesterNumber: true, track: true, createdAt: true, batch: { select: { degreeProgram: true, batchName: true } } } }),
    details: await safe(() => sdb.studentDetail.findUnique({ where: { studentId: id } })),
    contact: await safe(() => sdb.studentContact.findUnique({ where: { studentId: id } })),
    enrolments: await prisma.studentEnrollment.findMany({ where: { studentId: id }, select: { status: true, course: { select: { code: true, title: true, creditHours: true } } } }),
    marks: await prisma.studentMark.findMany({ where: { studentId: id } }),
    attendance: await safe(() => prisma.attendanceRecord.findMany({ where: { studentId: id }, select: { courseId: true, status: true, createdAt: true } })),
    transcript: await prisma.studentTranscriptRecord.findMany({ where: { studentId: id }, select: { courseCode: true, courseTitle: true, creditHours: true, grade: true, gpaPoints: true, termName: true, termYear: true } }),
    fees: await safe(() => sdb.feeInvoice.findMany({ where: { studentId: id } })),
    notices: await safe(() => sdb.studentNotice.findMany({ where: { studentId: id } })),
  };
  await writeAuditLog({ action: "STUDENT_DATA_EXPORTED", entityType: "Student", entityId: id });
  return new NextResponse(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="my-data-${st.rollNumber || id}.json"` } });
}
export const GET = withErrors(GET_handler);
