import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { create, edit, move, saveRates, scriptMarks, sessionMarks, setCodes, sideOf, type Side } from "../../../lib/affWork";
import { setFlag } from "../../../lib/scopedSettings";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// POST { action, … } — affiliation work (Adeel prompt §28–30): create {kind, title, data, collegeId?} · edit {id, data}
// · move {id, to, note} · marks {id, rows[], confirm} · ack {id} (a college acknowledges a notice) · rates {rates}.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const inst = await chairmanIdFor(user as never);
  const s = await sideOf(user as never, inst);
  if (!s.universityId || (!s.asUni && !s.asCollege)) return NextResponse.json({ error: "Your institute isn't an affiliating university or an affiliated college." }, { status: 403 });
  const side: Side = s.asUni ? "UNI" : "COLLEGE";
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const rec = b.id ? await db.affRecord.findUnique({ where: { id: String(b.id) } }) : null;
  if (b.id && (!rec || rec.universityId !== s.universityId || (side === "COLLEGE" && rec.collegeId && rec.collegeId !== inst))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    switch (b.action) {
      case "create": return NextResponse.json({ id: await create(user, side, s.universityId, side === "COLLEGE" ? inst : b.collegeId || null, String(b.kind), String(b.title || ""), b.data || {}) });
      case "edit": await edit(user, side, rec, b.data || {}); return NextResponse.json({ ok: true });
      case "move": await move(user, side, rec, String(b.to), String(b.note || "")); return NextResponse.json({ ok: true });
      case "marks": await sessionMarks(user, side, rec, (b.rows || []).map((r: { roll: string; mark: unknown }) => ({ roll: String(r.roll), mark: r.mark === "" || r.mark == null ? null : Number(r.mark) })), !!b.confirm); return NextResponse.json({ ok: true });
      case "ack": if (side !== "COLLEGE") break; await setFlag(inst, `aff:ack:${rec.id}`, new Date().toISOString()); await db.affEvent.create({ data: { id: randomUUID(), recordId: rec.id, byId: user.id, action: "ACKNOWLEDGED", note: null } }); return NextResponse.json({ ok: true });
      case "codes": if (side !== "UNI" || rec?.kind !== "MARKING") break; await setCodes(user, rec, String(b.rolls || "").split(/[\n,;]+/)); return NextResponse.json({ ok: true });
      case "scripts": if (side !== "UNI" || rec?.kind !== "MARKING") break; await scriptMarks(user, rec, (b.rows || []).map((r: { code: string; mark: unknown }) => ({ code: String(r.code), mark: r.mark === "" || r.mark == null ? null : Number(r.mark) }))); return NextResponse.json({ ok: true });
      case "rates": if (side !== "UNI" || user.role !== "CHAIRMAN") break; await saveRates(s.universityId, b.rates, user.id); return NextResponse.json({ ok: true });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Not allowed." }, { status: 403 });
}
export const POST = withErrors(POST_handler);
