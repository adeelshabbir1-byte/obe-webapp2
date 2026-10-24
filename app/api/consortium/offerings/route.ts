import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { saveOffering } from "../../../../lib/consortiumOfferings";
import { institutionOf } from "../../../../lib/consortiumAgreements";

// POST { id?, courseId, term, mode, seats, feePerCredit, schedule, labArrangement, deadline, startsOn, centres[], about, status }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const me = await institutionOf(user);
    if (!me) return NextResponse.json({ error: "Your account is not part of an institute." }, { status: 403 });
    return NextResponse.json({ ok: true, message: await saveOffering(user, me, b) });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
