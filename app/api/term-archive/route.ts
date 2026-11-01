import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { archiveTerm, decideAmendment, requestAmendment } from "../../../lib/termArchive";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { action: "archive", term } — Controller / HOD / IH archive a term (courses with approved results).
// POST { action: "amend", courseId, reason } — a teacher or leader requests an amendment to an archived course.
// POST { action: "decide", id, approve } — Controller / HOD decide it (never their own).
const ARCHIVERS = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"];
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; term?: string; courseId?: string; reason?: string; id?: string; approve?: boolean };
  const controller = ((user as { extraRoles?: string[] }).extraRoles || []).includes("EXAM_CONTROLLER");
  try {
    if (b.action === "archive") {
      if (!ARCHIVERS.includes(user.role) && !controller) return NextResponse.json({ error: "Only the Controller, HOD or Institute Head archives a term." }, { status: 403 });
      return NextResponse.json(await archiveTerm(await chairmanIdFor(user as never), String(b.term || ""), user.id));
    }
    if (b.action === "amend") return NextResponse.json({ ok: true, id: await requestAmendment(user, String(b.courseId || ""), String(b.reason || "")) });
    if (b.action === "decide") {
      if (!["HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) && !controller) return NextResponse.json({ error: "Only the Controller or HOD decides amendments." }, { status: 403 });
      await decideAmendment(user, String(b.id || ""), !!b.approve);
      return NextResponse.json({ ok: true });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
