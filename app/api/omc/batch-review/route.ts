import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { markReview, propose, endorse, setProposalStatus, finalise } from "../../../../lib/batchApproval";
import { withErrors } from "../../../../lib/apiHandler";

/**
 * POST { batchId, action, ... } — members of the batch's department OMC.
 *   review { step, on }    propose { step, courseId, kind, reason, semester | ch | code | title | type | subjectExpertId | prerequisiteCourseId }
 *   endorse { yes, note }    keep / drop { proposalId } (Convener)    finalise (Convener, once more than half endorse)
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const me = { id: user.realUserId || user.id, name: user.name };
  const b = await req.json().catch(() => ({}));
  const batchId = String(b.batchId || "");
  try {
    switch (b.action) {
      case "review": await markReview(me, batchId, String(b.step || ""), b.on !== false && b.on !== "false"); return NextResponse.json({ ok: true });
      case "propose": {
        const payload = { semester: b.semester, ch: b.ch, code: b.code, title: b.title, type: b.type, subjectExpertId: b.subjectExpertId, prerequisiteCourseId: b.prerequisiteCourseId };
        await propose(me, batchId, { step: String(b.step || "changes"), courseId: b.courseId ? String(b.courseId) : null, kind: String(b.kind || ""), payload, reason: String(b.reason || "") });
        return NextResponse.json({ ok: true, message: "Proposal sent to the Program Lead." });
      }
      case "endorse": { const t = await endorse(me, batchId, b.yes === true || b.yes === "true", String(b.note ?? b.comment ?? "")); return NextResponse.json({ ok: true, message: `Endorsed ${t.yes} of ${t.total}${t.waiting.length ? ` · waiting: ${t.waiting.join(", ")}` : ""}.` }); }
      case "keep": case "drop": await setProposalStatus(me, String(b.proposalId || ""), b.action === "keep"); return NextResponse.json({ ok: true });
      case "finalise": { const s = await finalise(me, batchId); return NextResponse.json({ ok: true, message: `${s.batch} is approved by the OMC.` }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
