import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { recheck, answerSuggestion } from "../../../../../../lib/sePlan";

/**
 * POST { action, ... } — the course's Subject Expert.
 *   recheck — "Rechecked — no change" on a plan approved for the previous batch
 *   answer { suggestionId, added, note } — an OMC suggestion: added to the plan, or a reply with reasons
 */
export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!user || !course) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "recheck") { await recheck(user, course.id); return NextResponse.json({ ok: true }); }
    if (b.action === "answer") {
      const db = (await import("../../../../../../lib/db")).prisma as unknown as Record<string, any>;
      const s = await db.sePlanSuggestion.findUnique({ where: { id: String(b.suggestionId || "") } });
      if (!s || s.courseId !== course.id) return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
      await answerSuggestion(user, s.id, b.added === true || b.added === "true", String(b.note ?? b.reply ?? ""));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
