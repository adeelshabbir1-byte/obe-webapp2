import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../../lib/instructorGuard";
import { renumberPaperDistribution } from "../../../../../../../../lib/paperDistributionOrdering";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string; itemId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const item = await prisma.paperDistributionItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.courseId !== course.id || item.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const direction = body.direction;
  if (!["up", "down"].includes(direction)) return NextResponse.json({ error: "direction must be up or down" }, { status: 400 });

  const all = await prisma.paperDistributionItem.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" } });
  const idx = all.findIndex((c) => c.id === item.id);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= all.length) return NextResponse.json({ error: "already at that end" }, { status: 400 });

  const a = all[idx], b = all[swapWith];
  await prisma.paperDistributionItem.update({ where: { id: a.id }, data: { orderIndex: b.orderIndex } });
  await prisma.paperDistributionItem.update({ where: { id: b.id }, data: { orderIndex: a.orderIndex } });

  await renumberPaperDistribution(course.id, "INSTRUCTOR");
  return NextResponse.json({ ok: true });
}
