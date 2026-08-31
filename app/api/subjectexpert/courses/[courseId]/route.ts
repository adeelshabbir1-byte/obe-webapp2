import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function GET(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUBJECT_EXPERT") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { clos: { orderBy: { code: "asc" } }, lectureRows: { orderBy: { lectureNumber: "asc" } } },
  });
  if (!course || course.subjectExpertId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ course });
}
