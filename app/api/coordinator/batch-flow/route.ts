import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { flowOf, markStep, stepHref, TOTAL_STEPS, applySyncDefaults, fillSeDefaults } from "../../../../lib/batchFlow";
import { submitBatch, plOpinion } from "../../../../lib/batchApproval";
import { setupStatus, markNew } from "../../../../lib/batchSetup";

/** GET ?batchId= — the 13 steps of the batch's set-up (its Program Lead). */
export async function GET(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batchId = new URL(req.url).searchParams.get("batchId") || "";
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true } });
  if (!b || b.coordinatorId !== user.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ flow: await flowOf(batchId) });
}

/**
 * POST { batchId, action, ... } — the batch's Program Lead.
 *   done { step } — this step is final; returns where the next step is    reopen { step }
 *   newRest — every course still open in "Sync & equalise" is a new course    defaults — apply the synced courses' defaults again
 *   seDefaults — fill the Subject Experts' defaults (step 11)    submit — send the batch to the OMC    opinion { proposalId, agree, comment } — on an OMC proposal
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "Only the Program Lead." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const batchId = String(body.batchId || "");
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true } });
  if (!b || b.coordinatorId !== user.id) return NextResponse.json({ error: "Not your batch." }, { status: 404 });
  try {
    switch (body.action) {
      case "done": case "reopen": {
        const n = Number(body.step);
        await markStep(batchId, n, user, body.action === "done");
        const f = await flowOf(batchId);
        const next = Math.min(TOTAL_STEPS, n + 1);
        return NextResponse.json({ ok: true, next: f ? stepHref(next, batchId, f.steps[3].done) : null, done: f?.done });
      }
      case "newRest": {
        const st = await setupStatus(batchId);
        const open = (st?.rows || []).filter((r) => !r.matched && !r.isNew);
        for (const r of open) await markNew(user, r.id);
        return NextResponse.json({ ok: true, message: `${open.length} course(s) marked new.` });
      }
      case "defaults": {
        const ids = (await prisma.course.findMany({ where: { batchId }, select: { id: true } })).map((c) => c.id);
        const r = await applySyncDefaults(ids, user.id);
        return NextResponse.json({ ok: true, message: `${r.moved} moved to the previous batch's semester · ${r.ses} Subject Expert(s) · ${r.plans} plan(s) brought over.` });
      }
      case "seDefaults": {
        const r = await fillSeDefaults(batchId, user.id);
        return NextResponse.json({ ok: true, message: `${r.synced} from the previous batch · ${r.owner} from the curriculum course's owner.${r.left.length ? ` Still without a Subject Expert: ${r.left.join(", ")}.` : " Every course has a Subject Expert."}` });
      }
      case "submit": await submitBatch(user, batchId); return NextResponse.json({ ok: true, message: "Sent to the OMC for approval." });
      case "opinion": await plOpinion(user, String(body.proposalId || ""), body.agree === true || body.agree === "true", String(body.comment ?? body.note ?? "")); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
