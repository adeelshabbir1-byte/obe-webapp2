import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../../lib/contentSync";
import { renumberClos } from "../../../../../../../../lib/cloOrdering";
import { writeAuditLog } from "../../../../../../../../lib/audit";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string; cloId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const clo = await prisma.cLO.findUnique({ where: { id: params.cloId } });
  if (!clo || clo.courseId !== course.id || clo.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const direction = body.direction; // "up" | "down"
  if (!["up", "down"].includes(direction)) return NextResponse.json({ error: "direction must be up or down" }, { status: 400 });

  const all = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" }, orderBy: { orderIndex: "asc" } });
  const idx = all.findIndex((c) => c.id === clo.id);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= all.length) return NextResponse.json({ error: "already at that end" }, { status: 400 });

  // Swap orderIndex via temporary values first, to avoid tripping the
  // @@unique([courseId, source, code]) constraint mid-update.
  const a = all[idx], b = all[swapWith];
  await prisma.cLO.update({ where: { id: a.id }, data: { code: `TEMP-${a.id}` } });
  await prisma.cLO.update({ where: { id: b.id }, data: { code: `TEMP-${b.id}`, orderIndex: a.orderIndex } });
  await prisma.cLO.update({ where: { id: a.id }, data: { orderIndex: b.orderIndex } });

  await renumberClos(course.id, "SE");
  await writeAuditLog({ actorUserId: user.id, action: "CLO_REORDERED", entityType: "CLO", entityId: clo.id });
  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ ok: true });
}
