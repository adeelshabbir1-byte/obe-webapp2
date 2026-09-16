import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { copyCourseContent } from "../../../../../lib/benchmarkCopy";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const { courseIdA, courseIdB } = body;
  if (!courseIdA || !courseIdB || courseIdA === courseIdB) {
    return NextResponse.json({ error: "two different courseIds are required" }, { status: 400 });
  }

  try {

  const [courseA, courseB, memberA, memberB] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseIdA } }),
    prisma.course.findUnique({ where: { id: courseIdB } }),
    prisma.courseEquivalenceMember.findUnique({ where: { courseId: courseIdA } }),
    prisma.courseEquivalenceMember.findUnique({ where: { courseId: courseIdB } }),
  ]);
  if (!courseA || !courseB) return NextResponse.json({ error: "course not found" }, { status: 404 });

  // A pair only makes sense as one real class taught together — so both
  // courses must actually be offered in the same term, not just share a
  // code/semester number across different cohorts.
  if (courseA.offeredTermName !== courseB.offeredTermName || courseA.offeredTermYear !== courseB.offeredTermYear) {
    return NextResponse.json({
      error: `these are offered in different terms (${courseA.code}: ${courseA.offeredTermName || "unset"} ${courseA.offeredTermYear || ""}, ${courseB.code}: ${courseB.offeredTermName || "unset"} ${courseB.offeredTermYear || ""}) — they can't be taught as one class`,
    }, { status: 400 });
  }

  // Already in the same group — nothing to do.
  if (memberA && memberB && memberA.groupId === memberB.groupId) {
    return NextResponse.json({ groupId: memberA.groupId });
  }

  let groupId: string;

  if (memberA && !memberB) {
    groupId = memberA.groupId;
    await prisma.courseEquivalenceMember.create({ data: { groupId, courseId: courseIdB } });
  } else if (memberB && !memberA) {
    groupId = memberB.groupId;
    await prisma.courseEquivalenceMember.create({ data: { groupId, courseId: courseIdA } });
  } else if (memberA && memberB) {
    // Both already grouped, but in different groups — merge B's group into A's.
    groupId = memberA.groupId;
    await prisma.courseEquivalenceMember.updateMany({ where: { groupId: memberB.groupId }, data: { groupId } });
    const oldGroup = await prisma.courseEquivalenceGroup.findUnique({ where: { id: memberB.groupId } });
    if (oldGroup) await prisma.courseEquivalenceGroup.delete({ where: { id: memberB.groupId } }).catch(() => {});
  } else {
    const group = await prisma.courseEquivalenceGroup.create({
      data: { chairmanId: user.managedById, createdById: user.id, name: `${courseA.code} / ${courseB.code}` },
    });
    groupId = group.id;
    await prisma.courseEquivalenceMember.createMany({ data: [{ groupId, courseId: courseIdA }, { groupId, courseId: courseIdB }] });
  }

  await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_PAIRED", entityType: "CourseEquivalenceGroup", entityId: groupId, metadata: { courseIdA, courseIdB } });

  // Give the other course a head start: if one already has a full template
  // (CLOs, weights, instruments, lecture content) and the other has none,
  // copy it over wholesale — same PLO-number-translation as the benchmark
  // system, fully editable afterward, not a live sync. Only fills in an
  // empty target, and falls back to a lighter PLO-only copy otherwise.
  await copyFullContentIfEmpty(courseIdA, courseIdB);
  await copyFullContentIfEmpty(courseIdB, courseIdA);
  await copyPloMappingByNumber(courseIdA, courseIdB);
  await copyPloMappingByNumber(courseIdB, courseIdA);

  return NextResponse.json({ groupId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong pairing these courses" }, { status: 500 });
  }
}

async function copyFullContentIfEmpty(fromCourseId: string, toCourseId: string) {
  const [fromCloCount, toCloCount] = await Promise.all([
    prisma.cLO.count({ where: { courseId: fromCourseId, source: "SE" } }),
    prisma.cLO.count({ where: { courseId: toCourseId, source: "SE" } }),
  ]);
  if (fromCloCount === 0 || toCloCount > 0) return; // nothing to give, or target already has its own content
  await copyCourseContent(fromCourseId, toCourseId);
}

async function copyPloMappingByNumber(fromCourseId: string, toCourseId: string) {
  const [fromMappings, toMappings, toCourse] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId: fromCourseId }, include: { plo: true } }),
    prisma.coursePloMapping.count({ where: { courseId: toCourseId } }),
    prisma.course.findUnique({ where: { id: toCourseId } }),
  ]);
  if (fromMappings.length === 0 || toMappings > 0 || !toCourse) return; // only fill in an empty target

  const toPlos = await prisma.pLO.findMany({ where: { batchId: toCourse.batchId || "", number: { in: fromMappings.map((m) => m.plo.number) } } });
  const toPloByNumber = new Map(toPlos.map((p) => [p.number, p]));

  for (const m of fromMappings) {
    const match = toPloByNumber.get(m.plo.number);
    if (match) {
      await prisma.coursePloMapping.upsert({
        where: { courseId_ploId: { courseId: toCourseId, ploId: match.id } },
        create: { courseId: toCourseId, ploId: match.id, assignedById: m.assignedById },
        update: {},
      });
    }
  }
}
