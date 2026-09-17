import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" }, select: { id: true } });
  const coordinatorIds = coordinators.map((c) => c.id);

  // select (not include) — only the handful of fields the dropdowns and
  // group list actually use, not full nested Batch/CLO/etc records for
  // every one of what can now be several hundred offered courses.
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    select: {
      id: true, code: true, title: true, semesterNumber: true,
      batch: { select: { degreeProgram: true, batchName: true } },
      contentSyncMember: { select: { groupId: true, isBase: true } },
    },
    orderBy: [{ code: "asc" }],
  });

  const groups = await prisma.courseContentSyncGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    select: {
      id: true, name: true, createdById: true,
      members: {
        select: {
          courseId: true, isBase: true,
          course: { select: { code: true, title: true, semesterNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const creatorIds = groups.map((g) => g.createdById).filter((id): id is string => !!id);
  const creators = creatorIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }) : [];
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));

  return NextResponse.json({
    courses: courses.map((c) => ({
      id: c.id, code: c.code, title: c.title, degreeProgram: c.batch?.degreeProgram || "", batchName: c.batch?.batchName || "",
      semesterNumber: c.semesterNumber, groupId: c.contentSyncMember?.groupId || null, isBase: c.contentSyncMember?.isBase ?? null,
    })),
    groups: groups.map((g) => ({
      id: g.id, name: g.name, createdByName: g.createdById ? creatorNameById.get(g.createdById) || null : null,
      members: g.members.map((m) => ({
        courseId: m.courseId, isBase: m.isBase, code: m.course.code, title: m.course.title,
        degreeProgram: m.course.batch?.degreeProgram || "", batchName: m.course.batch?.batchName || "", semesterNumber: m.course.semesterNumber,
      })),
    })),
  });
}
