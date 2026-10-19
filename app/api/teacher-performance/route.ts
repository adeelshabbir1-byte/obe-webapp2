import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { REPORT_VIEWER_ROLES, reportPeople } from "../../../lib/facultyProfile";
import { termReport, reportHtml, parseTerm } from "../../../lib/teacherPerformance";

export const maxDuration = 60;

// GET ?user=&term=Fall-2026 — the report as a Word document (the teacher themself, or HOD / Dean / Head for their staff).
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("user") || user.id;
  if (id !== user.id && !(REPORT_VIEWER_ROLES.includes(user.role) && (await reportPeople(user)).some((p) => p.id === id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const t = parseTerm(req.nextUrl.searchParams.get("term"));
  const r = await termReport(id, t);
  return new NextResponse(reportHtml(r), { headers: { "Content-Type": "application/msword", "Content-Disposition": `attachment; filename="performance-${r.teacher.name.replace(/[^A-Za-z0-9]+/g, "-")}-${t.name}-${t.year}.doc"` } });
}
