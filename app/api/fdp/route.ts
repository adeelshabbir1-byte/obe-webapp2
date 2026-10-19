import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { REPORT_VIEWER_ROLES, reportPeople } from "../../../lib/facultyProfile";
import { saveSession, markAttendance, addExternal, setTarget, yearData, hoursBy, target, FDP_HINT, FDP_KINDS } from "../../../lib/fdp";

const day = (s: unknown) => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(`${s}T00:00:00Z`) : null);

// GET ?year=&csv=1 — the year's hours per teacher (council report). POST { action, ... } — session | attendance | external | target
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !REPORT_VIEWER_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  const people = await reportPeople(user);
  const d = await yearData(chairmanId, year);
  const h = hoursBy(d), t = await target(chairmanId);
  const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
  const rows = [["Name", "Department", "Sessions attended", "Hours here", "Hours outside", "Total", "Target", "Met"].map(q).join(",")];
  for (const p of people) { const x = h.get(p.id) || { internal: 0, external: 0 }; const n = d.att.filter((a) => a.userId === p.id).length; rows.push([p.name, p.department_?.name || "", n, x.internal, x.external, x.internal + x.external, t, x.internal + x.external >= t ? "Yes" : "No"].map(q).join(",")); }
  rows.push("", ["Session", "Type", "Date", "Hours", "Facilitator", "Attended"].map(q).join(","));
  for (const s of d.sessions) rows.push([s.title, FDP_KINDS[s.kind] || s.kind, s.date.toISOString().slice(0, 10), s.hours, s.facilitator || "", d.att.filter((a) => a.sessionId === s.id).length].map(q).join(","));
  return new NextResponse(rows.join("\n"), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="fdp-${year}.csv"` } });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  const manage = REPORT_VIEWER_ROLES.includes(user.role);
  try {
    if (b.action === "external") {
      const date = day(b.date), hours = Number(b.hours), title = String(b.title || "").trim().slice(0, 200);
      if (!title || !date || !(hours > 0 && hours <= 200)) return NextResponse.json({ error: "Give the title, date and hours." }, { status: 400 });
      await addExternal(chairmanId, user.id, { title, organizer: b.organizer ? String(b.organizer).slice(0, 160) : null, date, hours });
      return NextResponse.json({ ok: true });
    }
    if (!manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (b.action === "session") {
      const date = day(b.date), title = String(b.title || "").trim().slice(0, 200);
      if (!title || !date) return NextResponse.json({ error: "Give the title and date." }, { status: 400 });
      await saveSession(chairmanId, { id: b.id || undefined, title, kind: FDP_KINDS[b.kind] ? b.kind : "WORKSHOP", topic: b.topic || null, date, hours: Math.max(0, Math.min(100, Number(b.hours) || 0)), facilitator: b.facilitator || null, venue: b.venue || null, audience: b.audience || null, reason: b.reason || null, status: ["PLANNED", "HELD", "CANCELLED"].includes(b.status) ? b.status : "PLANNED" }, user.id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "attendance") { await markAttendance(chairmanId, String(b.sessionId), Array.isArray(b.userIds) ? b.userIds.map(String) : []); return NextResponse.json({ ok: true }); }
    if (b.action === "target") { const h = Number(b.hours); if (!(h > 0 && h <= 500)) return NextResponse.json({ error: "Hours a year?" }, { status: 400 }); await setTarget(chairmanId, h); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) { console.error("fdp", e); return NextResponse.json({ error: FDP_HINT }, { status: 500 }); }
}
