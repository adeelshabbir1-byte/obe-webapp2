import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { book, requestTime, cancel, COUNSEL_HINT } from "../../../../lib/counselling";

/** POST { action: "book", slotId, kind, mode, reason } | { action: "request", counsellorId, kind, mode, reason } | { action: "cancel", bookingId } */
export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const s = (v: unknown, n = 500) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  try {
    if (b.action === "book") { await book(st.id, st.name, s(b.slotId), s(b.kind), s(b.mode), s(b.reason)); return NextResponse.json({ ok: true }); }
    if (b.action === "request") { await requestTime(st.id, st.name, s(b.counsellorId), s(b.kind), s(b.mode), s(b.reason)); return NextResponse.json({ ok: true }); }
    if (b.action === "cancel") { await cancel({ kind: "student", id: st.id, name: st.name }, s(b.bookingId), ""); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const m = String((e as Error).message || e);
    return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(m) ? COUNSEL_HINT : m.slice(0, 300) }, { status: 400 });
  }
}
