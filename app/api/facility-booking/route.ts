import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { book, cancel, clashes, BOOKING_HINT } from "../../../lib/facilityBooking";

const day = (s: unknown) => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(`${s}T00:00:00Z`) : null);
const time = (s: unknown) => (s && /^\d{1,2}:\d{2}$/.test(String(s).trim()) ? String(s).trim().padStart(5, "0") : null);

// GET ?resource&date&start&end — clash check. POST { action: book | cancel }
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams, d = day(q.get("date")), s = time(q.get("start")), e = time(q.get("end"));
  if (!d || !s || !e || !q.get("resource")) return NextResponse.json({ blocking: [], notes: [] });
  try { return NextResponse.json(await clashes(await chairmanIdFor(user), String(q.get("resource")), d, s, e)); } catch { return NextResponse.json({ error: BOOKING_HINT }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "cancel") { await cancel(chairmanId, String(b.id), user); return NextResponse.json({ ok: true }); }
    const d = day(b.date), s = time(b.startTime), e = time(b.endTime), purpose = String(b.purpose || "").trim().slice(0, 300);
    if (!b.resource || !d || !s || !e || !purpose) return NextResponse.json({ error: "Choose the place, date, times (e.g. 10:00) and purpose." }, { status: 400 });
    const notes = await book(chairmanId, { resource: String(b.resource), date: d, startTime: s, endTime: e, purpose }, user.id);
    return NextResponse.json({ ok: true, message: notes.length ? `Booked. Note: ${notes.join("; ")}` : "Booked." });
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    return NextResponse.json({ error: /Clash|end time|Not found|Only/.test(m) ? m : BOOKING_HINT }, { status: 400 });
  }
}
