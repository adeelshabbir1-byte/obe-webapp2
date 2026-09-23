import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { copyBenchmarkIfAvailable, seedFromMasterCourseIfAvailable } from "../../../../lib/benchmarkCopy";
import { findOwningChairmanId } from "../../../../lib/institutionCurriculum";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { subjectExpert: true },
  });
  return NextResponse.json({
    courses: courses.map((c) => ({
      id: c.id, code: c.code, title: c.title, creditHours: c.creditHours,
      subjectExpertName: c.subjectExpert?.name ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.code || !body.title || !body.creditHours || !body.batchId) {
    return NextResponse.json({ error: "code, title, creditHours, batchId are required" }, { status: 400 });
  }
  const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
  if (!batch || batch.coordinatorId !== user.id) {
    return NextResponse.json({ error: "invalid batch" }, { status: 400 });
  }

  // Same defense-in-depth check as import-hec and fill-elective: an
  // optional masterCourseId here must actually belong to this
  // coordinator's own institution, never trusted as-is from the client.
  if (body.masterCourseId) {
    const masterCourse = await prisma.masterCourse.findUnique({ where: { id: body.masterCourseId }, include: { masterCurriculum: { select: { chairmanId: true } } } });
    if (!masterCourse) return NextResponse.json({ error: "that curriculum course wasn't found" }, { status: 404 });
    const owningChairmanId = await findOwningChairmanId(user.id);
    const belongsHere = masterCourse.masterCurriculum.chairmanId === null || masterCourse.masterCurriculum.chairmanId === owningChairmanId;
    if (!belongsHere) return NextResponse.json({ error: "that course doesn't belong to your institution's curriculum" }, { status: 403 });
  }

  const course = await prisma.course.create({
    data: {
      code: body.code,
      title: body.title,
      creditHours: parseInt(body.creditHours, 10),
      coordinatorId: user.id,
      batchId: body.batchId,
      masterCourseId: body.masterCourseId || null,
    },
  });

  const benchmark = await copyBenchmarkIfAvailable(course.id, user.id, body.masterCourseId || null, body.code);
  if (!benchmark) await seedFromMasterCourseIfAvailable(course.id, body.masterCourseId || null);

  await writeAuditLog({
    actorUserId: user.id,
    action: body.masterCourseId ? "COURSE_ADOPTED_FROM_MASTER" : "COURSE_CREATED",
    entityType: "Course",
    entityId: course.id,
    metadata: body.masterCourseId ? { masterCourseId: body.masterCourseId } : undefined,
  });

  return NextResponse.json({ course, benchmarkCopied: !!benchmark }, { status: 201 });
}
