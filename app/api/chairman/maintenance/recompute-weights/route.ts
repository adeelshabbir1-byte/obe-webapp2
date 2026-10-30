import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { recomputeRowWeight } from "../../../../../lib/lectureWeights";
import { withErrors } from "../../../../../lib/apiHandler";

// One-time (repeatable, harmless) maintenance action: recompute every
// LectureRow's weightPct using the current, correct split logic in
// lib/lectureWeights.ts. Needed because recompute only ever runs on rows
// touched by an add/remove action — a row nobody has touched since an
// older, buggy version wrote its weightPct keeps showing that stale
// number forever, even though it has nothing currently mapped to it.
// This walks every row in every course and forces a fresh, correct value.
async function POST_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await prisma.lectureRow.findMany({ select: { id: true } });
  for (const row of rows) {
    await recomputeRowWeight(row.id);
  }

  return NextResponse.json({ rowsRecomputed: rows.length });
}
export const POST = withErrors(POST_handler);
