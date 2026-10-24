import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { institutionOf } from "../../../../lib/consortiumAgreements";
import { setApproval, mark } from "../../../../lib/consortiumExams";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: approve (Chairman: centres our students may use) | mark (centre staff: attendance), ... }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "approve") {
      if (user.role !== "CHAIRMAN") throw new Error("The Chairman approves exam centres for your students.");
      await setApproval(user.id, user.id, str(b.centreId, 60), b.on === true || b.on === "true", str(b.note, 300));
      return NextResponse.json({ ok: true, message: b.on ? "Approved for your students." : "No longer approved." });
    }
    if (b.action === "mark") {
      if (!(await institutionOf(user))) throw new Error("Your account is not part of an institute.");
      return NextResponse.json({ ok: true, message: await mark(user, str(b.id, 60), { present: b.present === true || b.present === "true", method: str(b.method, 20), invigilator: str(b.invigilator, 120), recordingRef: str(b.recordingRef, 200) }) });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
