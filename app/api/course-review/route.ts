import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { cdb } from "../../../lib/complexProblems";
import { withErrors } from "../../../lib/apiHandler";

// The instructor's end-of-course review: per CLO reason and action, what worked, challenges, changes for next time.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const course = user ? await prisma.course.findUnique({ where: { id: String(b.courseId || "") }, select: { id: true, instructorId: true } }) : null;
  if (!user || !user.mfaVerified || !course || course.instructorId !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const per: Record<string, { reason: string; action: string }> = {};
  for (const [k, v] of Object.entries(b)) { const m = k.match(/^(reason|action)_(.+)$/); if (m && typeof v === "string") { per[m[2]] = per[m[2]] || { reason: "", action: "" }; per[m[2]][m[1] as "reason" | "action"] = v.slice(0, 2000); } }
  const t = (v: unknown) => (typeof v === "string" ? v.slice(0, 4000) : null);
  const data = { instructorId: user.id, perCloJson: JSON.stringify(per), worked: t(b.worked), challenges: t(b.challenges), changes: t(b.changes), submittedAt: b.submit ? new Date() : undefined };
  try { await cdb.courseReview.upsert({ where: { courseId: course.id }, create: { courseId: course.id, ...data }, update: data }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Run prisma/migration_teaching_extras.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
