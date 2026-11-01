import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { planReview } from "../../../lib/aiChecks";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 120;

// POST { courseId } — the "AI review" of a Subject Expert's plan: a scored checklist with concrete fixes (cached per version).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const course = await prisma.course.findUnique({ where: { id: String(b.courseId || "") }, select: { id: true, subjectExpertId: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
  const chairmanId = await chairmanIdFor(user);
  const may = !!course && course.coordinator.managedById === chairmanId && (course.subjectExpertId === user.id || course.coordinatorId === user.id || ["OMC", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role));
  if (!course || !may) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { const r = await planReview(user, chairmanId, course.id); return NextResponse.json({ ...r.result, model: r.model, cached: r.cached, costUsd: r.costUsd }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
