import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { importPlan } from "../../../lib/courseHistory";
import { refreshInstructorCopy } from "../../../lib/instructorCopy";
import { prisma } from "../../../lib/db";
import { withErrors } from "../../../lib/apiHandler";

// POST { action: import | useSePlan, targetCourseId, sourceCourseId?, plan? }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "useSePlan") {
      const c = await prisma.course.findFirst({ where: { id: String(b.targetCourseId || ""), instructorId: user.id }, select: { id: true } });
      if (!c) throw new Error("Not your class.");
      const blocked = await refreshInstructorCopy(c.id);
      if (blocked) throw new Error(blocked);
      return NextResponse.json({ ok: true, message: "Your delivery copy now follows the Subject Expert's plan." });
    }
    const message = await importPlan(user, String(b.targetCourseId || ""), String(b.sourceCourseId || ""), b.plan === "INSTRUCTOR" ? "INSTRUCTOR" : "SE");
    return NextResponse.json({ ok: true, message });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
