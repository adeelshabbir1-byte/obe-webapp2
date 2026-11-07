import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import * as M from "../../../lib/workMonitor";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const LEADERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "LAB_MANAGER"];
// Queue item 20. POST { action: advisernote | labneed | seed | compliance }; GET ?report=<kind> logs a version and opens it.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.redirect(new URL("/login", req.url));
  const href = await M.logReport(await chairmanIdFor(user as never), String(req.nextUrl.searchParams.get("report") || ""), user.id);
  return NextResponse.redirect(new URL(href || "/reports-center", req.url));
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (b.action === "advisernote") { await M.addAdviserNote(user.id, String(b.studentId), String(b.text || ""), b.planTerm ? String(b.planTerm) : null, !!b.planApproved); return NextResponse.json({ ok: true }); }
    if (!LEADERS.includes(user.role)) return NextResponse.json({ error: "Not for your role." }, { status: 403 });
    if (b.action === "labneed") { await M.saveLabNeed(cid, { courseId: String(b.courseId), category: String(b.category || ""), perStudents: Number(b.perStudents) || 1, labId: b.labId || null, note: b.note || null }); return NextResponse.json({ ok: true }); }
    if (b.action === "seed") return NextResponse.json({ ok: true, n: await M.seedCompliance(cid, String(b.body || "")) });
    if (b.action === "schedule") { if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "The Institute Head sets the schedule." }, { status: 403 }); await M.saveReportSchedule(cid, Array.isArray(b.kinds) ? b.kinds.map(String) : [], user.id); return NextResponse.json({ ok: true }); }
    if (b.action === "compliance") { await M.saveCompliance(cid, b.item || {}); return NextResponse.json({ ok: true }); }
  } catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /adviserNote|labCourseNeed|complianceItem|does not exist/.test(m) ? M.MON_HINT : m }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
