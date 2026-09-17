import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { pairForEquivalence } from "../../../../../lib/equivalencePairing";

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
    const [courseA, courseB] = await Promise.all([
      prisma.course.findUnique({ where: { id: courseIdA } }),
      prisma.course.findUnique({ where: { id: courseIdB } }),
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

    const result = await pairForEquivalence(courseIdA, courseIdB, user.managedById, user.id);
    if (!result) return NextResponse.json({ error: "course not found" }, { status: 404 });

    await writeAuditLog({ actorUserId: user.id, action: "EQUIVALENCE_PAIRED", entityType: "CourseEquivalenceGroup", entityId: result.groupId, metadata: { courseIdA, courseIdB } });

    return NextResponse.json({ groupId: result.groupId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong pairing these courses" }, { status: 500 });
  }
}
