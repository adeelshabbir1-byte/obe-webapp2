import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { apply, withdraw, claimPayment } from "../../../../lib/consortiumApplications";
import { changeCentre } from "../../../../lib/consortiumExams";
import { choose } from "../../../../lib/consortiumJoint";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// Student: POST { action: apply | withdraw | pay, ... }
export async function POST(req: NextRequest) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "apply") return NextResponse.json({ ok: true, message: await apply(st.id, str(b.offeringId, 60), { wantsCredit: b.wantsCredit === true, examCentreId: str(b.examCentreId, 60), statement: str(b.statement, 1000) }) });
    if (b.action === "withdraw") return NextResponse.json({ ok: true, message: await withdraw(st.id, str(b.id, 60)) });
    if (b.action === "centre") return NextResponse.json({ ok: true, message: await changeCentre(st.id, str(b.id, 60), str(b.centreId, 60)) });
    if (b.action === "plan") return NextResponse.json({ ok: true, message: await choose(st.id, str(b.courseId, 60), str(b.chairmanId, 60)) });
    if (b.action === "pay") return NextResponse.json({ ok: true, message: await claimPayment(st.id, str(b.id, 60), str(b.ref, 120)) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
