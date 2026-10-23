import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { canEditQa, canViewQa, qaInstitute, saveRecord, deleteRecord, createProgram, records, qkind, QA_HINT } from "../../../lib/qaOffice";

const q = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

// GET ?export=<kind>[&ranking=QS] — the register as CSV (PQR in the register's column order; rankings per ranking).
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewQa(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await qaInstitute(user);
  const k = qkind(req.nextUrl.searchParams.get("export") || "");
  if (!k) return NextResponse.json({ error: "unknown" }, { status: 404 });
  let rows = (await records(cid, k.key)) || [];
  const rk = req.nextUrl.searchParams.get("ranking");
  if (k.key === "RANKING" && rk) rows = rows.filter((r) => r.data.ranking === rk);
  const csv = [k.fields.map((f) => q(f.label)).join(","), ...rows.map((r) => k.fields.map((f) => q(r.data[f.key])).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${k.short.replace(/\W+/g, "-")}${rk ? `-${rk}` : ""}.csv"` } });
}

// POST { action: save | delete | createProgram, kind, id?, refId?, ...fields }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  // Department heads may add and update department reviews and new-program proposals; the rest is the quality office's.
  const hod = ["HEAD_OF_DEPARTMENT"].includes(user.role) && ["DEPT_REVIEW", "PROGRAM_PROPOSAL", "ACTION", "STAGES"].includes(String(b.kind)) && b.action === "save";
  if (!canEditQa(user) && !hod) return NextResponse.json({ error: "Only the QEC / quality office, the Dean or the Institute Head can change this." }, { status: 403 });
  const cid = await qaInstitute(user);
  try {
    if (b.action === "save") { const id = await saveRecord(cid, user.id, String(b.kind), b.id ? String(b.id) : null, b.refId ? String(b.refId) : null, b); return NextResponse.json({ ok: true, id, message: "Saved." }); }
    if (b.action === "delete") { await deleteRecord(cid, user.id, String(b.id)); return NextResponse.json({ ok: true, message: "Deleted." }); }
    if (b.action === "createProgram") { const n = await createProgram(cid, user.id, String(b.id)); return NextResponse.json({ ok: true, message: `${n} is now a program in OBEHUB — its Program Lead can add the first batch.` }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /qaRecord|QaRecord|does not exist/.test(m) ? QA_HINT : m }, { status: 400 });
  }
}
