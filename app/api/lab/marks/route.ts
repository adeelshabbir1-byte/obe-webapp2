import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor } from "../../../../lib/labAccess";
import { labMarksLocked } from "../../../../lib/labTheory";
import { writeAuditLog } from "../../../../lib/audit";
import { withErrors } from "../../../../lib/apiHandler";

// The Lab Engineer saves the marks of one lab session for the whole class.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const labNumber = parseInt(body.labNumber, 10);
  const maxScore = parseFloat(body.maxScore);
  if (!body.courseId || !labNumber || labNumber < 1 || labNumber > 40 || !(maxScore > 0) || !Array.isArray(body.marks)) {
    return NextResponse.json({ error: "choose the lab number and what it is marked out of" }, { status: 400 });
  }
  const access = await labAccessFor(user, body.courseId);
  if (!access || access.as !== "ENGINEER") return NextResponse.json({ error: "only the Lab Engineer of this lab can enter marks" }, { status: 403 });
  { const lk = await labMarksLocked(access.lab.id); if (lk) return NextResponse.json({ error: lk }, { status: 409 }); }

  const enrolled = await prisma.studentEnrollment.findMany({ where: { courseId: access.lab.id, status: "ACTIVE" }, select: { studentId: true } });
  const allowed = new Set<string>(enrolled.map((e) => e.studentId));
  let saved = 0, cleared = 0;
  for (const m of body.marks as { studentId: string; score: number | string | null }[]) {
    if (!allowed.has(m.studentId)) continue;
    if (m.score === null || m.score === undefined || /^\s*(a|abs|absent)?\s*$/i.test(String(m.score))) {
      const r = await prisma.labMark.deleteMany({ where: { courseId: access.lab.id, studentId: m.studentId, labNumber } });
      cleared += r.count;
      continue;
    }
    const score = parseFloat(String(m.score));
    if (isNaN(score) || score < 0 || score > maxScore) return NextResponse.json({ error: `a mark must be between 0 and ${maxScore}` }, { status: 400 });
    await prisma.labMark.upsert({
      where: { courseId_studentId_labNumber: { courseId: access.lab.id, studentId: m.studentId, labNumber } },
      create: { courseId: access.lab.id, studentId: m.studentId, labNumber, score, maxScore, enteredById: user.id },
      update: { score, maxScore, enteredById: user.id },
    });
    saved++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "LAB_MARKS_SAVED", entityType: "Course", entityId: access.lab.id, metadata: { labNumber, saved, cleared } });
  // Early warning: a lab item with most students below the pass mark alerts the theory teacher of the linked topic.
  await import("../../../../lib/itemWarnings").then((x) => x.afterLabMarks(access.lab.id, labNumber)).catch((e) => console.warn("lab warning:", (e as Error).message));
  return NextResponse.json({ ok: true, saved, cleared });
}
export const POST = withErrors(POST_handler);
