import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { computeCgpa, standingFromCgpa } from "../../../../lib/academicStanding";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const advisedBatches = await prisma.batch.findMany({ where: { advisorId: user.id } });
  if (advisedBatches.length === 0) return NextResponse.json({ advisedBatches: [], students: [], pendingRequests: [] });

  const batchIds = advisedBatches.map((b) => b.id);
  const students = await prisma.student.findMany({
    where: { batchId: { in: batchIds } },
    include: {
      batch: true,
      enrollments: { where: { course: { isOffered: true } }, include: { course: true } },
      degreePlanEntries: { include: { course: true } },
    },
    orderBy: { name: "asc" },
  });

  const studentsOut = await Promise.all(students.map(async (s) => {
    const cgpa = await computeCgpa(s.id);
    const standing = standingFromCgpa(cgpa);
    const modifiedPlanCount = s.degreePlanEntries.filter((e) => e.plannedSemesterNumber !== e.course.semesterNumber).length;
    return {
      id: s.id, name: s.name, rollNumber: s.rollNumber, batchId: s.batchId, batchLabel: `${s.batch.degreeProgram} — ${s.batch.batchName}`,
      currentSemesterNumber: s.currentSemesterNumber, cgpa, standing, modifiedPlanCount,
      currentCourses: s.enrollments.map((e) => `${e.course.code}`),
    };
  }));

  const pendingRequests = await prisma.registrationApprovalRequest.findMany({
    where: { student: { batchId: { in: batchIds } }, status: "PENDING" },
    include: { student: true, course: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    advisedBatches: advisedBatches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` })),
    students: studentsOut,
    pendingRequests: pendingRequests.map((r) => ({
      id: r.id, actionType: r.actionType, reasonCode: r.reasonCode, createdAt: r.createdAt.toISOString(),
      studentId: r.studentId, studentName: r.student.name, studentRollNumber: r.student.rollNumber, courseCode: r.course.code, courseTitle: r.course.title,
    })),
  });
}
export const GET = withErrors(GET_handler);
