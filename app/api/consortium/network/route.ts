import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { withErrors } from "../../../../lib/apiHandler";
import * as N from "../../../../lib/networkDegrees";

// Queue item 21. POST { action: plan | rotation | review | complaint | decide | notice | settle | quality }.
export const dynamic = "force-dynamic";
const PLANNERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];
const STAFF = [...PLANNERS, "OMC", "SUBJECT_EXPERT", "INSTRUCTOR"];
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!STAFF.includes(user.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const s = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);
  const head = (ok: string[]) => { if (!ok.includes(user.role)) throw new Error("Your role cannot do this here."); };
  try {
    switch (b.action) {
      case "plan": head(PLANNERS); if (b.publish) head(["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"]); await N.savePlan(user, cid, s(b.program), s(b.intake, 20), b.labels || {}, s(b.bos), !!b.publish); break;
      case "rotation": head(PLANNERS); await N.saveRotation(user, cid, { courseCode: s(b.courseCode, 30), teacher: s(b.teacher, 120), start: s(b.start, 10), shared: !!b.shared, legs: typeof b.legsText === "string" ? b.legsText.split(/[;\n]/).map((x: string) => { const m = /^(.*?)\s+(\d+)\s*(?:weeks?)?\s*(.*)$/i.exec(x.trim()); return m ? { university: s(m[1], 120), weeks: Number(m[2]), city: s(m[3], 60) } : null; }).filter(Boolean) as { university: string; weeks: number; city: string }[] : Array.isArray(b.legs) ? b.legs.map((l: Record<string, unknown>) => ({ university: s(l.university, 120), weeks: Number(l.weeks) || 0, city: s(l.city, 60) })) : [], note: s(b.note, 500) }, b.id ? s(b.id, 60) : undefined); break;
      case "review": await N.blindReview(user, cid, s(b.pairId, 60), s(b.itemId, 60), !!b.ok, s(b.note, 500)); break;
      case "complaint": head(PLANNERS); await N.fileComplaint(user, cid, s(b.against, 60), s(b.about, 200), s(b.text, 3000)); break;
      case "decide": head(PLANNERS); await N.decideComplaint(user, cid, s(b.id, 60), s(b.decision ?? b.note, 2000), !!b.appeal); break;
      case "notice": head(["CHAIRMAN"]); await N.giveNotice(user, cid, Number(b.months) || 0, s(b.teachOut, 2000)); break;
      case "settle": head(["CHAIRMAN"]); await N.markSettled(user, cid, s(b.key, 200), s(b.ref ?? b.note, 120)); break;
      case "quality": head(PLANNERS); await N.saveReview(user, cid, s(b.offeringId, 60), { year: s(b.year, 10), cloPct: b.cloPct === "" || b.cloPct == null ? null : Number(b.cloPct), moderation: s(b.moderation, 500), feedback: b.feedback === "" || b.feedback == null ? null : Number(b.feedback), actions: s(b.actions, 2000) }); break;
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message || e).slice(0, 300) }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
