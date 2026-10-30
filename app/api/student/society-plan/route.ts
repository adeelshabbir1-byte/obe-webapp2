import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { officesOf } from "../../../../lib/engagement";
import { submitPlan, ELECTION_HINT, studentPlace } from "../../../../lib/elections";
import { eventClashes } from "../../../../lib/eventClash";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// GET ?date=YYYY-MM-DD&start=HH:MM&end=HH:MM — what clashes with that slot (office holders).
async function GET_handler(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  if (!(await officesOf(student.id)).length) return NextResponse.json({ error: "For society office holders." }, { status: 403 });
  const date = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Choose a date." }, { status: 400 });
  const p = await studentPlace(student.id);
  return NextResponse.json(await eventClashes(p?.chairmanId || "", date, req.nextUrl.searchParams.get("start"), req.nextUrl.searchParams.get("end")));
}

// POST { action: "yearPlan", societyId, text } | { action: "report", societyId, eventId, text, participants? }
async function POST_handler(req: NextRequest) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const societyId = str(b.societyId, 60);
  if (!(await officesOf(student.id)).some((o) => o.societyId === societyId)) return NextResponse.json({ error: "Only the society's office holders do this." }, { status: 403 });
  const text = str(b.text, 6000);
  if (text.length < 30) return NextResponse.json({ error: "Write a few lines at least." }, { status: 400 });
  try {
    if (b.action === "yearPlan") { await submitPlan(student.id, societyId, "YEAR_PLAN", { text }); return NextResponse.json({ ok: true }); }
    if (b.action === "report") {
      const ev = await prisma.societyEvent.findFirst({ where: { id: str(b.eventId, 60), societyId, status: "APPROVED", eventDate: { lte: new Date() } } });
      if (!ev) return NextResponse.json({ error: "Choose an approved event that has taken place." }, { status: 400 });
      const n = Number(b.participants);
      await submitPlan(student.id, societyId, "EVENT_REPORT", { text, eventId: ev.id, participants: Number.isFinite(n) && n > 0 ? Math.round(n) : null });
      return NextResponse.json({ ok: true });
    }
  } catch { return NextResponse.json({ error: ELECTION_HINT }, { status: 500 }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
