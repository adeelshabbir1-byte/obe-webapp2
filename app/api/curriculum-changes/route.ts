import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { UC_HINT, propose, omcDecide, bosDecide, forward } from "../../../lib/universityCurriculum";

const str = (v: unknown, n = 1000) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const BOS_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];

// POST { action: propose | omc | bos | forward, … } — changes moving from a batch to the university curriculum.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  if (!chairmanId) return NextResponse.json({ error: "No institute." }, { status: 400 });
  try {
    let message = "";
    if (b.action === "propose") {
      const c = await prisma.course.findFirst({ where: { id: str(b.courseId, 60), OR: [{ subjectExpertId: user.id }, { coordinatorId: user.id }] }, select: { id: true } });
      if (!c) throw new Error("Only the course's Subject Expert (or Program Lead) proposes changes for future batches.");
      message = await propose(user, c.id, { plan: b.plan === "INSTRUCTOR" ? "INSTRUCTOR" : "SE", summary: str(b.summary || b.note), reason: str(b.reason), chairmanId });
    } else if (b.action === "omc") {
      if (user.role !== "OMC") throw new Error("The OMC decides this.");
      message = await omcDecide(user, chairmanId, str(b.id, 60), b.decision === "BATCH_ONLY" ? "BATCH_ONLY" : "BOS_PENDING", str(b.note));
    } else if (b.action === "bos") {
      if (!BOS_ROLES.includes(user.role)) throw new Error("The Board of Studies' chair or secretary records its decision.");
      const d = b.decision === "BOS_APPROVED" ? "BOS_APPROVED" : b.decision === "BOS_REJECTED" ? "BOS_REJECTED" : "BOS_DEFERRED";
      message = await bosDecide(user, chairmanId, str(b.id, 60), d, str(b.minutesId, 60), str(b.item, 60), str(b.note));
    } else if (b.action === "forward") {
      if (user.role !== "OMC") throw new Error("The OMC forwards BOS-approved changes.");
      message = await forward(user, chairmanId, str(b.id, 60));
    } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const m = (e as Error).message || "Failed.";
    return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? UC_HINT : m }, { status: 400 });
  }
}
