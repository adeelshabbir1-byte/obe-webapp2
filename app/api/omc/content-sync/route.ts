import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" }, select: { id: true } });
    const coordinatorIds = coordinators.map((c) => c.id);

    // Courses are only fetched for whichever batches the person actually
    // checked — with potentially several hundred offered courses across
    // every batch, loading them all just to populate two dropdowns was
    // the real source of the page hanging on "Loading…".
    const batchIdsParam = req.nextUrl.searchParams.get("batchIds");
    const selectedBatchIds = batchIdsParam ? batchIdsParam.split(",").filter(Boolean) : [];

    const courses = selectedBatchIds.length === 0 ? [] : await prisma.course.findMany({
      where: { coordinatorId: { in: coordinatorIds }, batchId: { in: selectedBatchIds } },
      select: {
        id: true, code: true, title: true, semesterNumber: true, courseType: true, batchId: true,
        batch: { select: { degreeProgram: true, batchName: true } },
        contentSyncMember: { select: { groupId: true, isBase: true } },
      },
      orderBy: [{ code: "asc" }],
    });

    // Two plain, separately-indexed lookups instead of one query with a
    // nested members.some.course.batchId filter — that relation chain
    // was a likely source of the page failing outright (a slow or
    // failing query returns nothing for res.json() to parse, which is
    // exactly the "Unexpected end of JSON input" error this was
    // producing).
    const groupIdsForSelectedCourses = selectedBatchIds.length === 0 ? [] : (
      await prisma.courseContentSyncMember.findMany({
        where: { course: { batchId: { in: selectedBatchIds } } },
        select: { groupId: true },
      })
    ).map((m) => m.groupId);
    const uniqueGroupIds = Array.from(new Set(groupIdsForSelectedCourses));

    const groups = uniqueGroupIds.length === 0 ? [] : await prisma.courseContentSyncGroup.findMany({
      where: { id: { in: uniqueGroupIds }, chairmanId: user.managedById || "" },
      select: {
        id: true, name: true, createdById: true,
        members: {
          select: {
            courseId: true, isBase: true,
            course: { select: { code: true, title: true, semesterNumber: true, courseType: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const creatorIds = groups.map((g) => g.createdById).filter((id): id is string => !!id);
    const creators = creatorIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }) : [];
    const creatorNameById = new Map(creators.map((u) => [u.id, u.name]));

    // The short display names OMC/Course Assigner already set up for the
    // Section Assignment Matrix — reused here too, so the grid shows the
    // same compact label instead of the raw (often long) course code.
    const shortNameRecords = await prisma.courseShortName.findMany({ where: { chairmanId: user.managedById || "" } });
    const shortNameByCode = new Map(shortNameRecords.map((s) => [s.courseCode, s.shortName]));

    return NextResponse.json({
      courses: courses.map((c) => ({
        id: c.id, code: c.code, shortName: shortNameByCode.get(c.code) || null, title: c.title,
        degreeProgram: c.batch?.degreeProgram || "", batchName: c.batch?.batchName || "",
        batchId: c.batchId, semesterNumber: c.semesterNumber, courseType: c.courseType,
        groupId: c.contentSyncMember?.groupId || null, isBase: c.contentSyncMember?.isBase ?? null,
      })),
      groups: groups.map((g) => ({
        id: g.id, name: g.name, createdByName: g.createdById ? creatorNameById.get(g.createdById) || null : null,
        members: g.members.map((m) => ({
          courseId: m.courseId, isBase: m.isBase, code: m.course.code, shortName: shortNameByCode.get(m.course.code) || null,
          title: m.course.title, batchId: m.course.batchId,
          degreeProgram: m.course.batch?.degreeProgram || "", batchName: m.course.batch?.batchName || "",
          semesterNumber: m.course.semesterNumber, courseType: m.course.courseType,
        })),
      })),
    });
  } catch (err: any) {
    // A real response body on failure, always — a crash with no body at
    // all is what produces "Unexpected end of JSON input" on the client,
    // which tells you nothing about what actually went wrong.
    return NextResponse.json({ error: err?.message || "something went wrong loading content sync data" }, { status: 500 });
  }
}
