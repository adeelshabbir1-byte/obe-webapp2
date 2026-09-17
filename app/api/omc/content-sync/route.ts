import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const groups = await prisma.courseContentSyncGroup.findMany({ where: { chairmanId: user.managedById || "" }, orderBy: { createdAt: "asc" } });

  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { contentSyncMember: true },
    orderBy: [{ code: "asc" }],
  });

  const batchColumns = batches.map((b) => ({
    batchId: b.id,
    batchLabel: `${b.degreeProgram} — ${b.batchName}`,
    courses: allCourses
      .filter((c) => c.batchId === b.id)
      .map((c) => ({ id: c.id, code: c.code, title: c.title, groupId: c.contentSyncMember?.groupId || null })),
  }));

  const creatorIds = groups.map((g) => g.createdById).filter((id): id is string => !!id);
  const creators = creatorIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: creatorIds } } }) : [];
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));

  return NextResponse.json({
    batches: batchColumns,
    groups: groups.map((g) => ({ id: g.id, name: g.name, createdByName: g.createdById ? creatorNameById.get(g.createdById) || null : null })),
  });
}
