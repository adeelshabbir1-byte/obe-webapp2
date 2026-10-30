import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { CONSORTIUM_HINT, cdb } from "../../../../lib/consortium";
import { saveGradeMap } from "../../../../lib/consortiumTransfer";
import { propose, respond, manualPair, decide, adoptClos, autoPair, refresh, institutionOf, loadAgreement } from "../../../../lib/consortiumAgreements";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: propose | respond | pair | autoPair | refreshAll | decide | adopt, ... }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, message, ...extra });
  try {
    const me = await institutionOf(user);
    if (!me) return NextResponse.json({ error: "Your account is not part of an institute." }, { status: 403 });
    const head = user.role === "CHAIRMAN";
    switch (b.action) {
      case "propose": { if (!head) throw new Error("The Chairman proposes agreements."); const id = await propose(user.id, me, { kind: str(b.kind, 30), partnerId: str(b.partnerId, 60), title: str(b.title, 160), programme: str(b.programme, 160), curriculumId: str(b.curriculumId, 60), mouStart: str(b.mouStart, 30), mouEnd: str(b.mouEnd, 30), note: str(b.note, 800) }); return ok("Proposal sent to the partner university.", { id }); }
      case "respond": { if (!head) throw new Error("The Chairman answers agreement proposals."); return ok(await respond(user.id, me, str(b.agreementId, 60), b.accept === true || b.accept === "true", str(b.curriculumId, 60))); }
      case "pair": { await manualPair(user.id, me, str(b.agreementId, 60), str(b.courseA, 60), str(b.courseB, 60)); return ok("Pair added."); }
      case "autoPair": { const a = await loadAgreement(str(b.agreementId, 60)); if (!a?.parties.some((p) => p.chairmanId === me)) throw new Error("Not found."); return ok(`${await autoPair(user.id, a.id)} new pair(s) found.`); }
      case "refreshAll": {
        const a = await loadAgreement(str(b.agreementId, 60)); if (!a?.parties.some((p) => p.chairmanId === me)) throw new Error("Not found.");
        const es = (await cdb.consortiumEquivalence.findMany({ where: { agreementId: a.id }, select: { id: true } })) as { id: string }[];
        for (const e of es) await refresh(e.id);
        return ok(`Comparison recomputed for ${es.length} pair(s).`);
      }
      case "decide": return ok(await decide(user, str(b.id, 60), b.ok === true || b.ok === "true", str(b.note, 500)));
      case "adopt": return ok(await adoptClos(user.id, me, str(b.id, 60)));
      case "gradeMap": return ok(await saveGradeMap(user, str(b.agreementId, 60), str(b.map, 1000)));
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
