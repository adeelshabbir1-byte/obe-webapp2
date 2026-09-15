import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

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

  // Group ungrouped, offered courses by (normalized title, term) — same
  // name and same actual term is the only safe signal for "this is likely
  // one class taught across batches", matching the same rule the manual
  // pair endpoint already enforces.
  const buckets = new Map<string, typeof courses>();
  for (const c of courses) {
    if (alreadyGrouped.has(c.id)) continue;
    if (!c.offeredTermName || !c.offeredTermYear) continue;
    const key = `${c.title.trim().toLowerCase()}::${c.offeredTermName}::${c.offeredTermYear}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const suggestions = Array.from(buckets.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      title: group[0].title,
      term: `${group[0].offeredTermName} ${group[0].offeredTermYear}`,
      courses: group.map((c) => ({
        id: c.id, code: c.code,
        batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
      })),
    }));

  return NextResponse.json({ suggestions });
}
