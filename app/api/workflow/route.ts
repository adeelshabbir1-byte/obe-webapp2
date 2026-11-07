import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import * as W from "../../../lib/workflowGaps";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
// Queue item 19. POST { action: note {courseId, lectureNumber?, kind, text, toUserId?, cqiId?} | lab {code, week, instructions, rubric}
//   | ack {broadcastId, courseId, note} | review {publicCourseId} | decide {publicCourseId, accept, decision} }.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const u = user as never as { id: string; name: string; role: string };
  try {
    if (b.action === "note") { await W.addNote(u, String(b.courseId), { lectureNumber: b.lectureNumber === "" || b.lectureNumber == null ? null : Number(b.lectureNumber), kind: String(b.kind), text: String(b.text || ""), toUserId: b.toUserId || null, cqiId: b.cqiId || null }); return NextResponse.json({ ok: true }); }
    if (b.action === "lab") return NextResponse.json({ ok: true, id: await W.broadcastLab(u, await chairmanIdFor(user as never), String(b.code || ""), Math.max(1, Number(b.week) || 1), String(b.instructions || ""), String(b.rubric || "")) });
    if (b.action === "ack") { await W.ackLab(u, String(b.broadcastId), String(b.courseId), String(b.note || "")); return NextResponse.json({ ok: true }); }
    if (b.action === "review" || b.action === "decide") {
      if (user.role !== "SUPER_USER") return NextResponse.json({ error: "Platform only." }, { status: 403 });
      if (b.action === "review") await W.sendToReview(u, String(b.publicCourseId)); else await W.decideReview(u, String(b.publicCourseId), !!b.accept, String(b.decision || ""));
      return NextResponse.json({ ok: true });
    }
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /courseNote|labBroadcast|nationalReview|does not exist/.test(m) ? W.WG_HINT : m }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
