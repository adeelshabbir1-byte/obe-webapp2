import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import * as T from "../../../lib/teachingTools";
import { isTool } from "../../../lib/teachingToolsCore";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// One course's teaching tools. GET ?courseId=&tool=&do=classes|grades[&perQuestion=1]; POST { courseId, tool, action:
// link | roster | invite | enrol | sections | post | live | sync | mark | forums | hours | videos }.
async function guard(courseId: string, needAct: boolean) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const ctx = await T.courseCtx(courseId);
  const acc = ctx ? await T.courseAccess(user, ctx) : null;
  if (!ctx || !acc || (needAct && acc !== "act")) return { error: NextResponse.json({ error: "Only the course's teacher or Program Lead." }, { status: 403 }) };
  return { user, ctx };
}
const fail = (e: unknown) => { const m = (e as Error).message || ""; return NextResponse.json({ error: /courseToolLink|liveSession|odlModule|discussionActivity|teachingTool|does not exist/.test(m) ? T.TOOLS_HINT : m }, { status: 400 }); };

async function GET_handler(req: NextRequest) {
  const q = req.nextUrl.searchParams; const tool = q.get("tool") || "";
  const g = await guard(q.get("courseId") || "", true); if ("error" in g) return g.error;
  if (!isTool(tool)) return NextResponse.json({ error: "Choose a tool." }, { status: 400 });
  try {
    if (q.get("do") === "classes") return NextResponse.json({ classes: await T.classChoices(g.ctx, tool) });
    if (q.get("do") === "grades") return NextResponse.json(await T.gradesCsv(g.ctx, tool, q.get("perQuestion") === "1"));
  } catch (e) { return fail(e); }
  return NextResponse.json({ error: "Unknown request." }, { status: 400 });
}
async function POST_handler(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const g = await guard(String(b.courseId || ""), true); if ("error" in g) return g.error;
  const { user, ctx } = g; const tool = String(b.tool || "");
  if (!isTool(tool)) return NextResponse.json({ error: "Choose a tool." }, { status: 400 });
  try {
    let r: { message: string; [k: string]: unknown } = { message: "Done." };
    switch (b.action) {
      case "link": await T.linkCourse(ctx.id, tool, String(b.externalId || "")); r = { message: b.externalId ? "Linked ✓" : "Unlinked." }; break;
      case "roster": r = await T.syncRoster(ctx, tool, false); break;
      case "invite": r = await T.syncRoster(ctx, tool, true); break;
      case "enrol": r = await T.syncRoster(ctx, "MOODLE", true); break;
      case "sections": r = await T.moodleSectionsFor(ctx); break;
      case "post": r = await T.postInstrument(ctx, tool, String(b.instrumentId || ""), req.nextUrl.origin); break;
      case "live": r = await T.scheduleLive(user, ctx, tool, !!b.all); break;
      case "sync": r = await T.syncSessions(ctx, b.sessionId ? [String(b.sessionId)] : undefined); break;
      case "mark": await T.markSession(ctx.id, String(b.sessionId || ""), { status: b.status, recordingUrl: b.recordingUrl, attendees: b.attendees === "" ? null : b.attendees === undefined ? undefined : Number(b.attendees) }); r = { message: "Saved ✓" }; break;
      case "forums": r = await T.syncForums(ctx); break;
      case "hours": await T.setForumHours(ctx.id, String(b.forumId), Number(b.week), b.hours === "" ? null : Number(b.hours), b.graded === undefined ? undefined : !!b.graded); r = { message: "Saved ✓" }; break;
      case "videos": r = await T.refreshVideos(ctx); break;
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    if (!["mark", "hours"].includes(String(b.action))) await writeAuditLog({ actorUserId: user.id, action: "COURSE_TOOL_ACTION", entityType: "Course", entityId: ctx.id, metadata: { tool, action: b.action } });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) { return fail(e); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
