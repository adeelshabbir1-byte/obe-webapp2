import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

// Lightweight, fast list of batches (no course data at all) — used to
// render the checkbox picker before the potentially large course list
// is fetched, so the page has something to show almost instantly
// regardless of how many hundreds of courses exist overall.
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" }, select: { id: true } });
    const coordinatorIds = coordinators.map((c) => c.id);

    const batches = await prisma.batch.findMany({
      where: { coordinatorId: { in: coordinatorIds } },
      select: { id: true, degreeProgram: true, batchName: true, _count: { select: { courses: { where: { isOffered: true } } } } },
      orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    });

    return NextResponse.json({
      batches: batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName, offeredCourseCount: b._count.courses })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong loading batches" }, { status: 500 });
  }
}
