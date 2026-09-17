import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { copyCourseContent } from "../../../../../lib/benchmarkCopy";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "OMC" && user.role !== "CHAIRMAN")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { sourceCourseId, targetCourseId } = body;
  if (!sourceCourseId || !targetCourseId) return NextResponse.json({ error: "sourceCourseId and targetCourseId are required" }, { status: 400 });
  if (sourceCourseId === targetCourseId) return NextResponse.json({ error: "Source and target can't be the same course." }, { status: 400 });

  const targetCourse = await prisma.course.findUnique({ where: { id: targetCourseId } });
  if (!targetCourse) return NextResponse.json({ error: "Target course not found." }, { status: 404 });

  // Refuse rather than risk it: if any student has already been graded
  // on this course's instruments, clearing them would destroy real,
  // entered marks — not something a content-import should ever do
  // silently.
  const gradedMarkCount = await prisma.studentMark.count({ where: { courseId: targetCourseId } });
  if (gradedMarkCount > 0) {
    return NextResponse.json({ error: `This course already has ${gradedMarkCount} entered student mark(s). Importing would delete graded work, so this has been blocked — clear grades first if you're certain, or use a course that hasn't been graded yet.` }, { status: 409 });
  }

  // Clear the target's existing content, dependency-ordered, before the
  // clean copy — per your choice of "replace" over "merge".
  await prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId: targetCourseId } } });
  await prisma.paperDistributionItem.deleteMany({ where: { courseId: targetCourseId } });
  await prisma.lectureRow.deleteMany({ where: { courseId: targetCourseId } });
  await prisma.assessmentInstrument.deleteMany({ where: { courseId: targetCourseId } });
  await prisma.cLO.deleteMany({ where: { courseId: targetCourseId } });
  await prisma.coursePloMapping.deleteMany({ where: { courseId: targetCourseId } });

  const result = await copyCourseContent(sourceCourseId, targetCourseId);
  if (!result) return NextResponse.json({ error: "Source course not found." }, { status: 404 });

  return NextResponse.json({ ok: true, ...result });
}
