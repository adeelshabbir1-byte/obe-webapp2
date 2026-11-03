import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { chairmanIdFor } from "../../../../../../lib/reportScope";
import { preview } from "../../../../../../lib/markScanCore";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

// Scan a mark sheet: a photo or PDF of the award list → the AI reads it → matched to this course's students and
// assessments for the teacher to check. Nothing is saved here; saving goes through the normal marks entry.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const f = await req.formData().catch(() => null);
  const file = f?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Choose the photo or PDF of the mark sheet." }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use a photo (JPG, PNG) or a PDF." }, { status: 400 });
  if (file.size > 10_000_000) return NextResponse.json({ error: "The file is larger than 10 MB; take the photo again at a lower size." }, { status: 400 });
  const own = await prisma.assessmentInstrument.count({ where: { courseId: course.id, source: "INSTRUCTOR" } });
  const [insts, ens] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: own ? "INSTRUCTOR" : "SE" }, orderBy: [{ type: "asc" }, { label: "asc" }], select: { id: true, label: true, maxScore: true } }),
    prisma.studentEnrollment.findMany({ where: { courseId: course.id }, select: { student: { select: { id: true, rollNumber: true, name: true } } } }),
  ]);
  try {
    const { readMarkSheet } = await import("../../../../../../lib/aiChecks");
    const ai = await readMarkSheet(user, await chairmanIdFor(user as never), course.id, Buffer.from(await file.arrayBuffer()).toString("base64"), file.type, insts.map((i) => i.label));
    const students = ens.map((e) => ({ id: e.student.id, roll: e.student.rollNumber, name: e.student.name }));
    return NextResponse.json({ ...preview(ai, students, insts), instruments: insts, cost: ai.costUsd, cached: ai.cached });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
