import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { decide, suggestionsFor } from "../../../../../lib/topicAi";
import { forbidden, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 60;

// GET ?courseIds=a,b[&ai=0] — system suggestions for the open courses (never applied on their own).
async function GET_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const ids = (req.nextUrl.searchParams.get("courseIds") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40);
  return NextResponse.json(await suggestionsFor(user, ids, { ai: req.nextUrl.searchParams.get("ai") !== "0" }));
}

// POST { kind, key, hash, decision: ACCEPTED|REJECTED, reason, data } — remembers the decision. Accepting a course
// prerequisite (Program Lead only) sets it on the program's courses; accepting a topic link or an importance is done
// by the caller through the normal proposal (links API / Save) so it follows the same approvals.
async function POST_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const decision = b.decision === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
  if (decision === "REJECTED" && String(b.reason || "").trim().length < 3) return NextResponse.json({ error: "Say why (it is remembered, so the suggestion doesn't come back)." }, { status: 400 });
  if (b.kind === "COURSE_PREREQ" && decision === "ACCEPTED") {
    const d = b.data || {};
    if (user.role !== "PROGRAM_COORDINATOR" || d.coordinatorId !== user.id) return NextResponse.json({ error: "The Program Lead decides course prerequisites (Prerequisite Map)." }, { status: 403 });
    const from = await prisma.course.findMany({ where: { coordinatorId: user.id, code: String(d.fromCode || "") }, select: { id: true, batchId: true } });
    const to = await prisma.course.findMany({ where: { coordinatorId: user.id, code: String(d.toCode || "") }, select: { id: true, batchId: true, prerequisiteCourseId: true } });
    for (const t of to) {
      const f = from.find((x) => x.batchId === t.batchId);
      if (d.reverse) { if (t.prerequisiteCourseId && from.some((x) => x.id === t.prerequisiteCourseId)) await prisma.course.update({ where: { id: t.id }, data: { prerequisiteCourseId: null } }); }
      else if (f) await prisma.course.update({ where: { id: t.id }, data: { prerequisiteCourseId: f.id } });
    }
  }
  await decide(user, { kind: String(b.kind || ""), key: String(b.key || ""), hash: String(b.hash || "") }, decision, String(b.reason || ""));
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
