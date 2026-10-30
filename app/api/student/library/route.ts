import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { ldb, LIB_HINT, renew, reserve } from "../../../../lib/library";
import { withErrors } from "../../../../lib/apiHandler";

/** POST { action: "renew", loanId } | { action: "reserve", titleId } | { action: "cancelHold", holdId } — the student's own. */
async function POST_handler(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "");
  try {
    const H = (await prisma.student.findUnique({ where: { id: st.id }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } }))?.batch.coordinator?.managedById || "";
    if (b.action === "renew") { const due = await renew(H, s(b.loanId), { type: "STUDENT", id: st.id }); return NextResponse.json({ ok: true, message: `Renewed until ${due.toLocaleDateString("en-GB")}.` }); }
    if (b.action === "reserve") { await reserve(H, s(b.titleId), { type: "STUDENT", id: st.id }); return NextResponse.json({ ok: true, message: "Reserved — you will be told when a copy is ready." }); }
    if (b.action === "cancelHold") { await ldb.libraryHold.updateMany({ where: { id: s(b.holdId), memberType: "STUDENT", memberId: st.id, status: { in: ["WAITING", "READY"] } }, data: { status: "CANCELLED" } }); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties/.test(m) ? LIB_HINT : m.slice(0, 300) }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
