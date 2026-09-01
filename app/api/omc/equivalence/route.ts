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
    include: { equivalenceMember: true },
    orderBy: [{ code: "asc" }],
  });

  const batchColumns = batches.map((b) => ({
    batchId: b.id,
    batchLabel: `${b.degreeProgram} — ${b.batchName}`,
    courses: allCourses
      .filter((c) => c.batchId === b.id)
      .map((c) => ({ id: c.id, code: c.code, title: c.title, studentCount: b.studentCount, groupId: c.equivalenceMember?.groupId || null })),
  }));

  return NextResponse.json({
    batches: batchColumns,
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const group = await prisma.courseEquivalenceGroup.create({ data: { chairmanId: user.managedById, name: body.name } });

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_GROUP_CREATED", entityType: "CourseEquivalenceGroup", entityId: group.id });

  return NextResponse.json({ group }, { status: 201 });
}
