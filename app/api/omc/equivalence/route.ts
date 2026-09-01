import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    include: { members: { include: { course: { include: { batch: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  // Courses eligible to add: offered, not already in a group.
  const allOffered = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, equivalenceMember: true },
    orderBy: [{ code: "asc" }],
  });
  const availableCourses = allOffered.filter((c) => !c.equivalenceMember);

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id, name: g.name,
      members: g.members.map((m) => ({
        courseId: m.course.id, code: m.course.code, title: m.course.title,
        batchLabel: m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "—",
        studentCount: m.course.batch?.studentCount || 0,
      })),
    })),
    availableCourses: availableCourses.map((c) => ({
      id: c.id, code: c.code, title: c.title,
      batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
      studentCount: c.batch?.studentCount || 0,
    })),
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
