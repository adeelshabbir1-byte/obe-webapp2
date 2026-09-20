import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    orderBy: { createdAt: "asc" },
  });

  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { equivalenceMember: true, masterCourse: { select: { id: true, code: true, title: true } } },
    orderBy: [{ code: "asc" }],
  });

  const batchColumns = batches.map((b) => ({
    batchId: b.id,
    batchLabel: `${b.degreeProgram} — ${b.batchName}`,
    courses: allCourses
      .filter((c) => c.batchId === b.id)
      .map((c) => ({ id: c.id, code: c.code, title: c.title, studentCount: b.studentCount, groupId: c.equivalenceMember?.groupId || null, offeredTermName: c.offeredTermName, offeredTermYear: c.offeredTermYear })),
  }));

  const creatorIds = groups.map((g) => g.createdById).filter((id): id is string => !!id);
  const creators = creatorIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: creatorIds } } }) : [];
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));

  // A group's members SHOULD all share the same masterCourse link, once
  // set together via this page — but if only some were set (e.g. before
  // this feature existed, or set individually elsewhere), the first
  // non-null one found is shown as the group's current value.
  const masterCourseByGroupId = new Map<string, { id: string; code: string; title: string }>();
  for (const c of allCourses) {
    const groupId = c.equivalenceMember?.groupId;
    if (groupId && c.masterCourse && !masterCourseByGroupId.has(groupId)) masterCourseByGroupId.set(groupId, c.masterCourse);
  }

  return NextResponse.json({
    batches: batchColumns,
    groups: groups.map((g) => ({
      id: g.id, name: g.name, createdByName: g.createdById ? creatorNameById.get(g.createdById) || null : null,
      masterCourse: masterCourseByGroupId.get(g.id) || null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const group = await prisma.courseEquivalenceGroup.create({ data: { chairmanId: user.managedById, createdById: user.id, name: body.name } });

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_GROUP_CREATED", entityType: "CourseEquivalenceGroup", entityId: group.id });

  return NextResponse.json({ group }, { status: 201 });
}
