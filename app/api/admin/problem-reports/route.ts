import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../../lib/session";
import { adminCan } from "../../../../lib/platformTeam";
import { listReports, screenshotOf, answerReport, setPilot, KINDS, STATUS_WORD } from "../../../../lib/problemReports";
import { withErrors } from "../../../../lib/apiHandler";

// The Super Admin's problem reports. GET ?shot=<id> the screenshot · ?format=xlsx the list for the builders.
// POST { id, status, reply } answers one (the reporter hears it in the bell) · { pilot: { chairmanId, mode, departmentIds } }.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "SUPPORT"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("shot")) {
    const s = await screenshotOf(String(sp.get("shot")));
    if (!s) return NextResponse.json({ error: "No screenshot." }, { status: 404 });
    return new NextResponse(s.buf, { headers: { "Content-Type": s.type, "Cache-Control": "private, max-age=300" } });
  }
  const rows = await listReports({ status: sp.get("status") || undefined, role: sp.get("role") || undefined, page: sp.get("page") || undefined, kind: sp.get("kind") || undefined });
  if (sp.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Problem reports");
    ws.addRow(["When", "Status", "Type", "Institute", "User", "Role", "Page", "Note", "Reply", "Browser", "Screenshot"]).font = { bold: true };
    for (const r of rows) ws.addRow([r.createdAt.toISOString().slice(0, 16).replace("T", " "), STATUS_WORD[r.status] || r.status, KINDS[r.kind]?.label || r.kind, r.institute, r.user, r.role, r.page, r.note, r.reply || "", r.browser || "", r.hasShot ? `${req.nextUrl.origin}/api/admin/problem-reports?shot=${r.id}` : ""]);
    ws.columns.forEach((c, i) => { c.width = [17, 10, 14, 24, 20, 18, 30, 60, 40, 30, 40][i]; });
    return new NextResponse(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="problem-reports.xlsx"' } });
  }
  return NextResponse.json({ rows });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "SUPPORT"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.pilot) { await setPilot(String(b.pilot.chairmanId || ""), String(b.pilot.mode || "ALL"), Array.isArray(b.pilot.departmentIds) ? b.pilot.departmentIds.map(String) : [], user.id); return NextResponse.json({ ok: true }); }
  const r = await answerReport(user, String(b.id || ""), String(b.status || "UNDER_REVIEW"), String(b.reply || ""));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
