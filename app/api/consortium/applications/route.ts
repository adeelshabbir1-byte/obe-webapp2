import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { hostDecide, verifyPayment, creditDecide } from "../../../../lib/consortiumApplications";
import { transfer } from "../../../../lib/consortiumTransfer";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// Staff: POST { action: decide (host) | payment (host) | credit (home), id, ... }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const yes = (v: unknown) => v === true || v === "true";
  try {
    if (b.action === "decide") return NextResponse.json({ ok: true, message: await hostDecide(user, str(b.id, 60), yes(b.accept), str(b.note, 500)) });
    if (b.action === "payment") return NextResponse.json({ ok: true, message: await verifyPayment(user, str(b.id, 60), yes(b.ok)) });
    if (b.action === "credit") return NextResponse.json({ ok: true, message: await creditDecide(user, str(b.id, 60), yes(b.ok), str(b.asCourseId, 60), str(b.note, 500)) });
    if (b.action === "transfer") return NextResponse.json({ ok: true, message: await transfer(user, str(b.id, 60)) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
