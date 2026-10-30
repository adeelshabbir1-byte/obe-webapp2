import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { saveShares, launch, linkBatch, startGraduation, approveGraduation, issue } from "../../../../lib/consortiumJoint";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: shares | launch | link | audit | approve | issue, ... } — joint degree programmes.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = (message: string) => NextResponse.json({ ok: true, message });
  try {
    switch (b.action) {
      case "shares": return ok(await saveShares(user, str(b.agreementId, 60), b));
      case "launch": return ok(await launch(user, str(b.agreementId, 60)));
      case "link": return ok(await linkBatch(user, str(b.agreementId, 60), str(b.batchId, 60), b.on !== false && b.on !== "false"));
      case "audit": return ok(await startGraduation(user, str(b.studentId, 60)));
      case "approve": return ok(await approveGraduation(user, str(b.id, 60)));
      case "issue": return ok(await issue(user, str(b.id, 60)));
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (/does not exist|relation|Unknown arg/i.test(msg)) return NextResponse.json({ error: CONSORTIUM_HINT }, { status: 500 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
