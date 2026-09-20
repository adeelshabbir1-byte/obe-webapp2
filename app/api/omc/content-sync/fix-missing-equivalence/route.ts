import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { pairForEquivalence } from "../../../../../lib/equivalencePairing";
import { writeAuditLog } from "../../../../../lib/audit";

// One-time backfill: pairing/grouping through Content Sync was always
// supposed to also create a Course Equivalence link for any two members
// that turn out to be offered in the same term — since two courses in
// the same term are genuinely the same class running twice, not just
// sharing content. That check ran only at the moment of linking, so any
// group formed before it existed, or linked through a path that never
// had the check (batch auto-copy, for instance), was silently missed.
// This re-checks every existing group's members against each other now.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const groups = await prisma.courseContentSyncGroup.findMany({
    where: { chairmanId: user.managedById },
    include: { members: { include: { course: true } } },
  });

  let pairsChecked = 0;
  let pairsCreated = 0;
  const created: string[] = [];

  for (const group of groups) {
    const members = group.members;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i].course, b = members[j].course;
        if (!a.offeredTermName || a.offeredTermName !== b.offeredTermName || a.offeredTermYear !== b.offeredTermYear) continue;
        pairsChecked++;

        const existingA = await prisma.courseEquivalenceMember.findUnique({ where: { courseId: a.id } });
        const existingB = await prisma.courseEquivalenceMember.findUnique({ where: { courseId: b.id } });
        if (existingA && existingB && existingA.groupId === existingB.groupId) continue; // already linked to each other

        const result = await pairForEquivalence(a.id, b.id, user.managedById, user.id, true);
        if (result) { pairsCreated++; created.push(`${a.code} ↔ ${b.code}`); }
      }
    }
  }

  await writeAuditLog({ actorUserId: user.id, action: "CONTENT_SYNC_EQUIVALENCE_BACKFILLED", entityType: "CourseContentSyncGroup", entityId: "bulk", metadata: { pairsChecked, pairsCreated } });

  return NextResponse.json({ groupsChecked: groups.length, pairsChecked, pairsCreated, created });
}
