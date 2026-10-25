import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { castVote, confirmApproval, suggest, finaliseByOmc } from "../../../../../lib/sePlan";

// The OMC's decision on a Subject Expert's plan is a vote of the course's OMC: more than half approving carries it and
// the Convener confirms. Changes go to the Subject Expert as suggestions with reasons.

async function guard(courseId: string) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { coordinator: true } });
  if (!course || course.coordinator.managedById !== user.managedById) return null;
  return { user: { id: user.realUserId || user.id, name: user.name }, course };
}

/** Kept for the older decision form: approved = an approving vote; changes-requested = a vote against plus the comment as a suggestion. */
export async function PATCH(req: NextRequest, { params }: { params: { courseId: string } }) {
  const g = await guard(params.courseId);
  if (!g) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!["approved", "changes-requested"].includes(body.status)) return NextResponse.json({ error: "status must be 'approved' or 'changes-requested'" }, { status: 400 });
  const comment = String(body.comment || "").trim();
  try {
    if (body.status === "approved") { const v = await castVote(g.user, g.course.id, true, comment); return NextResponse.json({ ok: true, votes: v?.tally }); }
    if (comment.length < 3) return NextResponse.json({ error: "Say what should change (a comment)." }, { status: 400 });
    await castVote(g.user, g.course.id, false, comment);
    await suggest(g.user, g.course.id, [{ step: "review", text: comment, reason: comment }]);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

/**
 * POST { action, ... }
 *   vote { approve, note }    suggest { step, item, text, reason }    confirm (Convener)    finalise (Convener: the OMC's version)
 */
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const g = await guard(params.courseId);
  if (!g) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "vote": { const v = await castVote(g.user, g.course.id, b.approve === true || b.approve === "true", String(b.note ?? b.comment ?? "")); return NextResponse.json({ ok: true, message: v ? `Votes: ${v.tally.yes} of ${v.tally.total} approved${v.tally.no ? ` · ${v.tally.no} not` : ""}${v.tally.waiting.length ? ` · waiting: ${v.tally.waiting.join(", ")}` : ""}.` : "Saved." }); }
      case "suggest": await suggest(g.user, g.course.id, [{ step: String(b.step || "review"), item: b.item ? String(b.item) : undefined, text: String(b.text || ""), reason: String(b.reason || "") }]); return NextResponse.json({ ok: true, message: "Sent to the Subject Expert." });
      case "confirm": await confirmApproval(g.user, g.course.id); return NextResponse.json({ ok: true, message: "The plan is OMC-approved." });
      case "finalise": { const o = await finaliseByOmc(g.user, g.course.id); return NextResponse.json({ ok: true, message: `Finalised by the OMC${o.length ? ` (${o.length} point(s) recorded as overridden)` : ""}.` }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
