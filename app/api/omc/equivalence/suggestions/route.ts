import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  try {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById } });
    const coordinatorIds = coordinators.map((c) => c.id);

    const [courses, existingMembers] = await Promise.all([
      prisma.course.findMany({
        where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
        include: { batch: true },
      }),
      prisma.courseEquivalenceMember.findMany({ select: { courseId: true } }),
    ]);
    const alreadyGrouped = new Set(existingMembers.map((m) => m.courseId));

    // Group ungrouped, offered courses into equivalence-candidate clusters:
    // any two count as a match if they're in the same actual term (matching
    // the rule the manual pair endpoint enforces) AND share either the same
    // code or the same title. Matches are transitive — if A matches B by
    // code and B matches C by title, all three end up in one suggestion —
    // so this is a union-find over a same-term/same-code-or-title graph,
    // not a simple group-by-title.
    const eligible = courses.filter((c) => !alreadyGrouped.has(c.id) && c.offeredTermName && c.offeredTermYear);

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

    for (const c of eligible) find(c.id); // ensure every course starts in its own set

    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i], b = eligible[j];
        if (a.offeredTermName !== b.offeredTermName || a.offeredTermYear !== b.offeredTermYear) continue;
        const sameTitle = a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
        const sameCode = a.code.trim().toLowerCase() === b.code.trim().toLowerCase();
        if (sameTitle || sameCode) union(a.id, b.id);
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
        term: `${group[0].offeredTermName} ${group[0].offeredTermYear}`,
        courses: group.map((c) => ({
          id: c.id, code: c.code, title: c.title,
          batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
        })),
      }));

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong finding suggestions" }, { status: 500 });
  }
}
