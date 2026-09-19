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

    // Only the last 4 admission years are shown — a batch older than
    // that has already graduated, so there's nothing left to link for
    // content sync purposes. 4 years, not "this year minus 4", since a
    // batch admitted 4 years ago is still mid-way through its final
    // year right now.
    const currentYear = new Date().getFullYear();
    const earliestRelevantYear = currentYear - 3;

    const batches = await prisma.batch.findMany({
      where: { coordinatorId: { in: coordinatorIds }, startYear: { gte: earliestRelevantYear } },
      select: { id: true, degreeProgram: true, batchName: true, startYear: true, startTerm: true, _count: { select: { courses: true } } },
      orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    });

    return NextResponse.json({
      batches: batches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName, startYear: b.startYear, startTerm: b.startTerm, courseCount: b._count.courses })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong loading batches" }, { status: 500 });
  }
}
