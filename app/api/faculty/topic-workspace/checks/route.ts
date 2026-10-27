import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { accessFor, type Access } from "../../../../../lib/topicPlan";
import { checksFor, consortiumReference, programMap } from "../../../../../lib/topicChecks";
import { forbidden, parseOpen, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";

export const maxDuration = 60;

// GET ?open=[...] — the Checks tab for the open courses; ?map=<courseId> — the program map; ?consortium=<courseId> —
// the same course at other universities of the consortium.
export async function GET(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  if (sp.get("map")) {
    const a = await accessFor(user, String(sp.get("map")));
    if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(await programMap(a.coordinatorId));
  }
  if (sp.get("consortium")) {
    const a = await accessFor(user, String(sp.get("consortium")));
    if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ others: await consortiumReference(a.courseId) });
  }
  const cols: Access[] = [];
  for (const o of parseOpen(sp.get("open")).slice(0, 12)) { const a = await accessFor(user, o.courseId, o.plan); if (a) cols.push(a); }
  if (!cols.length && user.role === "PROGRAM_COORDINATOR") {
    const c = await prisma.course.findFirst({ where: { coordinatorId: user.id }, select: { id: true } });
    if (c) { const a = await accessFor(user, c.id); if (a) cols.push(a); }
  }
  return NextResponse.json(await checksFor(cols, user.role));
}
