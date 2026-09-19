import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  try {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById }, select: { id: true } });
    const coordinatorIds = coordinators.map((c) => c.id);

    // Same reasoning as the main course list: scanning every batch from
    // the last 4 years at once, for every chairman with a lot of data,
    // is exactly the kind of query that caused the page to hang before.
    // Suggestions are scoped to whichever batches are actually checked,
    // same as the courses/groups list — not the full 4-year span
    // unconditionally.
    const batchIdsParam = req.nextUrl.searchParams.get("batchIds");
    const selectedBatchIds = batchIdsParam ? batchIdsParam.split(",").filter(Boolean) : [];
    if (selectedBatchIds.length === 0) return NextResponse.json({ suggestions: [] });

    const [courses, existingMembers, shortNameRecords] = await Promise.all([
      prisma.course.findMany({
        where: { coordinatorId: { in: coordinatorIds }, batchId: { in: selectedBatchIds } },
        select: { id: true, code: true, title: true, semesterNumber: true, batch: { select: { degreeProgram: true, batchName: true } } },
      }),
      prisma.courseContentSyncMember.findMany({ select: { courseId: true } }),
      prisma.courseShortName.findMany({ where: { chairmanId: user.managedById } }),
    ]);
    const alreadyLinked = new Set(existingMembers.map((m) => m.courseId));
    const shortNameByCode = new Map(shortNameRecords.map((s) => [s.courseCode, s.shortName.trim().toLowerCase()]));

    // Unlike Course Equivalence, this has no same-term restriction —
    // content sync only cares whether two courses are really the same
    // taught material, regardless of which semester or batch offers it,
    // so matches are found across ALL of the last 4 years at once, not
    // scoped to one term. Same union-find approach otherwise: any two
    // courses sharing a code, title, or the short name you've already
    // assigned them link transitively into one suggested group, even
    // across more than two courses.
    const eligible = courses.filter((c) => !alreadyLinked.has(c.id));

    const parent = new Map<string, string>();
    function find(id: string): string {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
      return parent.get(id)!;
    }
    function union(a: string, b: string) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }

    for (const c of eligible) find(c.id);

    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i], b = eligible[j];
        const sameTitle = a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
        const sameCode = a.code.trim().toLowerCase() === b.code.trim().toLowerCase();
        const shortA = shortNameByCode.get(a.code), shortB = shortNameByCode.get(b.code);
        const sameShortName = !!shortA && shortA === shortB;
        if (sameTitle || sameCode || sameShortName) union(a.id, b.id);
      }
    }

    const clusters = new Map<string, typeof courses>();
    for (const c of eligible) {
      const root = find(c.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(c);
    }

    const suggestions = Array.from(clusters.values())
      .filter((group) => group.length > 1)
      .map((group) => ({
        courses: group.map((c) => ({
          id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        })),
      }));

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong finding suggestions" }, { status: 500 });
  }
}
