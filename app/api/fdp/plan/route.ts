import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { REPORT_VIEWER_ROLES } from "../../../../lib/facultyProfile";
import { savePlan, nominate, decideNomination, dayAttendance, saveCertificate, certificateFile, onDutyLetter } from "../../../../lib/fdpPlan";
import { withErrors } from "../../../../lib/apiHandler";

// A training over several days. GET ?letter=1&sessionId&userId — the on-duty letter (PDF) · ?cert=1&sessionId&userId — the
// certificate. POST { action: plan | nominate | decide | day } (JSON) or a certificate upload (form: sessionId, userId, file).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams, sessionId = String(sp.get("sessionId") || ""), userId = String(sp.get("userId") || user.id);
  if (userId !== user.id && !REPORT_VIEWER_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (sp.get("letter")) { const l = await onDutyLetter(chairmanId, sessionId, userId); return new NextResponse(Buffer.from(l.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${l.name}"` } }); }
  const f = await certificateFile(sessionId, userId);
  if (!f) return NextResponse.json({ error: "No certificate." }, { status: 404 });
  return new NextResponse(f.buf, { headers: { "Content-Type": f.type, "Content-Disposition": `inline; filename="${f.name.replace(/"/g, "")}"` } });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const manage = REPORT_VIEWER_ROLES.includes(user.role);
  try {
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const f = await req.formData();
      const file = f.get("file") as File | null;
      if (!file || !file.size) return NextResponse.json({ error: "Choose the certificate file." }, { status: 400 });
      await saveCertificate(chairmanId, String(f.get("sessionId") || ""), String(f.get("userId") || user.id), file, user);
      return NextResponse.json({ ok: true });
    }
    const b = await req.json().catch(() => ({}));
    if (b.action === "decide") { await decideNomination(chairmanId, String(b.id || ""), b.approve !== false, String(b.reason || ""), user); return NextResponse.json({ ok: true }); }
    if (!manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (b.action === "plan") return NextResponse.json({ ok: true, ...(await savePlan(chairmanId, String(b.sessionId || ""), { startDate: String(b.startDate || ""), endDate: String(b.endDate || b.startDate || ""), same: b.same !== false, start: String(b.start || ""), end: String(b.end || ""), days: Array.isArray(b.days) ? b.days : [], provisions: { transport: b.transport || undefined, food: b.food || undefined, residence: b.residence || undefined, tada: b.tada || undefined, registrationFee: b.registrationFee || undefined, onDuty: b.onDuty !== false, notes: b.notes || undefined } }, user.id)) });
    if (b.action === "nominate") return NextResponse.json({ ok: true, nominated: await nominate(chairmanId, String(b.sessionId || ""), Array.isArray(b.userIds) ? b.userIds.map(String) : [String(b.userId || "")].filter(Boolean), user) });
    if (b.action === "day") return NextResponse.json({ ok: true, present: await dayAttendance(chairmanId, String(b.sessionId || ""), String(b.date || ""), Array.isArray(b.userIds) ? b.userIds.map(String) : [], user.id) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
