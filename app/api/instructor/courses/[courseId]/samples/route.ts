import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { pdb, storeFile, MAX_FILE, LEVELS } from "../../../../../../lib/portfolio";

// Upload / remove a sampled student script for an assessment (best, average or weakest).
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file") as File | null, instrumentId = String(fd.get("instrumentId") || ""), studentId = String(fd.get("studentId") || ""), level = String(fd.get("level") || "");
  if (!file || !file.size) return NextResponse.json({ error: "Choose the scanned script (PDF or image)." }, { status: 400 });
  if (file.size > MAX_FILE) return NextResponse.json({ error: "File is over 8 MB." }, { status: 400 });
  if (!LEVELS.some((l) => l[0] === level)) return NextResponse.json({ error: "bad level" }, { status: 400 });
  const inst = await prisma.assessmentInstrument.findFirst({ where: { id: instrumentId, courseId: course.id } });
  const enr = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: course.id } } });
  if (!inst || !enr) return NextResponse.json({ error: "Assessment or student not in this course." }, { status: 400 });
  const mark = await prisma.studentMark.findUnique({ where: { studentId_instrumentId: { studentId, instrumentId } } });
  try {
    const fileUrl = await storeFile(file);
    await pdb.studentWorkSample.create({ data: { courseId: course.id, instrumentId, studentId, level, score: mark?.score ?? null, fileName: file.name.slice(0, 200), fileUrl, uploadedById: user.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && /storage/i.test(e.message) ? e.message : "Work samples are not set up yet — run prisma/migration_portfolio.sql." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  await pdb.studentWorkSample.deleteMany({ where: { id, courseId: course.id } });
  return NextResponse.json({ ok: true });
}
