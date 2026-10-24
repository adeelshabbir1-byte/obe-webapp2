import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { institutionOf } from "../../../../lib/consortiumAgreements";
import { postVacancy, applyVacancy, nocDecide, hostAct, answerOffer } from "../../../../lib/consortiumVacancies";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const yes = (v: unknown) => v === true || v === "true";

// POST { action: post | apply | noc | shortlist | offer | reject | answer, ... }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = (message: string) => NextResponse.json({ ok: true, message });
  try {
    switch (b.action) {
      case "post": { const me = await institutionOf(user); if (!me) throw new Error("Your account is not part of an institute."); return ok(await postVacancy(user, me, b)); }
      case "apply": return ok(await applyVacancy(user, str(b.vacancyId, 60), { coverNote: str(b.coverNote, 1500), shareAttainment: yes(b.shareAttainment), shareFeedback: yes(b.shareFeedback) }));
      case "noc": return ok(await nocDecide(user, str(b.id, 60), yes(b.ok), str(b.note, 500)));
      case "shortlist": case "offer": case "reject": return ok(await hostAct(user, str(b.id, 60), b.action, str(b.note, 500)));
      case "answer": return ok(await answerOffer(user, str(b.id, 60), yes(b.accept)));
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
