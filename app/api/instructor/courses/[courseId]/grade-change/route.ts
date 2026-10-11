import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { getGradingScaleForBatch } from "../../../../../../lib/gradingScaleLookup";
import { computeResultMate } from "../../../../../../lib/resultMate";
import { db, getCourseResult, approversFor, notify, logResult } from "../../../../../../lib/resultApproval";

// POST { studentId, newGrade, reason } — after the result is approved, the Instructor asks to change one student's
// grade. It takes effect only when the Chairman / Institute Head approves it.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const result = await getCourseResult(course.id);
  if (result?.status !== "APPROVED") return NextResponse.json({ error: "Grade changes are only for an approved result. Until then, correct the marks directly." }, { status: 409 });
  const studentId = String(b.studentId || ""), newGrade = String(b.newGrade || "").trim(), reason = String(b.reason || "").trim().slice(0, 1000);
  if (reason.length < 10) return NextResponse.json({ error: "Give a clear reason (at least 10 characters) — it is kept on record." }, { status: 400 });

  const full = await prisma.course.findUnique({ where: { id: course.id }, include: { batch: true } });
  const scale = full?.batch ? await getGradingScaleForBatch(full.coordinatorId, full.batch) : [];
  const letters = scale.length ? scale.map((g) => g.letter) : ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
  if (!letters.includes(newGrade)) return NextResponse.json({ error: "Choose a grade from the grading scale." }, { status: 400 });
  const rm = await computeResultMate(course.id);
  const row = rm.rows.find((r) => r.studentId === studentId);
  if (!row) return NextResponse.json({ error: "That student is not enrolled in this course." }, { status: 400 });
  if (row.grade === newGrade) return NextResponse.json({ error: `The student already has ${newGrade}.` }, { status: 400 });
  const pending = await db.gradeChangeRequest.findFirst({ where: { courseId: course.id, studentId, status: "PENDING" } });
  if (pending) return NextResponse.json({ error: "A grade change for this student is already waiting for a decision." }, { status: 409 });

  const reqRow = await db.gradeChangeRequest.create({ data: { courseId: course.id, studentId, oldGrade: row.grade, newGrade, totalPct: row.totalPct, reason, requestedById: user.id } });
  await logResult(user.id, "GRADE_CHANGE_REQUESTED", course.id, { studentId, rollNumber: row.rollNumber, oldGrade: row.grade, newGrade, reason });
  const ap = await approversFor(course.id);
  await notify(ap.chairmanId, user.id, ap.ids, `Grade change to decide: ${course.code} — ${row.rollNumber}`,
    `${user.name} asks to change ${row.name} (${row.rollNumber}) in ${course.code} from ${row.grade} to ${newGrade}. Reason: ${reason}`, "/results-approval");
  return NextResponse.json({ ok: true, id: reqRow.id });
}
