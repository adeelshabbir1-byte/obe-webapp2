import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor } from "../../../../lib/labAccess";
import { labMarksLocked } from "../../../../lib/labTheory";
import { labSessions } from "../../../../lib/labSessions";
import { scoreFor } from "../../../../lib/rubrics";
import { withErrors } from "../../../../lib/apiHandler";

// PUT { labCourseId, labNumber, studentId, levels } — rubric marking of one student in one lab session.
async function PUT_handler(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const access = user ? await labAccessFor(user, String(b.labCourseId || "")) : null;
  if (!access || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  { const lk = await labMarksLocked(access.lab.id); if (lk) return NextResponse.json({ error: lk }, { status: 409 }); }
  const labNumber = Number(b.labNumber);
  const session = (await labSessions(access.lab.id)).find((s) => s.labNumber === labNumber);
  if (!session?.criteria) return NextResponse.json({ error: "This lab session has no rubric." }, { status: 400 });
  const studentId = String(b.studentId || "");
  if (!(await prisma.studentEnrollment.count({ where: { courseId: access.lab.id, studentId, status: { not: "WITHDRAWN" } } }))) return NextResponse.json({ error: "That student is not in this lab." }, { status: 400 });
  const levels: Record<string, number> = {};
  for (const c of session.criteria) { const n = Number(b.levels?.[c.id]); if (Number.isInteger(n) && c.levels[n]) levels[c.id] = n; }
  const r = scoreFor(session.criteria, levels, session.maxScore);
  if (!r) return NextResponse.json({ error: "Choose a level for every criterion." }, { status: 400 });
  await (prisma as unknown as Record<string, any>).labMark.upsert({
    where: { courseId_studentId_labNumber: { courseId: access.lab.id, studentId, labNumber } },
    create: { courseId: access.lab.id, studentId, labNumber, score: r.score, maxScore: session.maxScore, enteredById: user.id, levelsJson: JSON.stringify(levels) },
    update: { score: r.score, maxScore: session.maxScore, enteredById: user.id, levelsJson: JSON.stringify(levels) },
  });
  return NextResponse.json({ ok: true, score: r.score });
}
export const PUT = withErrors(PUT_handler);
