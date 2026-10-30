import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { mdb, pick, finishAttempt, deadlineOf, type Quiz, type Attempt, type Q } from "../../../../lib/mcq";
import { withErrors } from "../../../../lib/apiHandler";

// Student side of an online quiz: start (questions drawn and shuffled once), save answers as they go, submit.
// Correct answers never leave the server before submission.
async function POST_handler(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const quiz = (await mdb.onlineQuiz.findUnique({ where: { id: String(b.quizId || "") } }).catch(() => null)) as Quiz | null;
  if (!quiz || quiz.status !== "PUBLISHED") return NextResponse.json({ error: "Quiz not available." }, { status: 404 });
  const enr = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId: quiz.courseId } } });
  if (!enr || enr.status === "WITHDRAWN") return NextResponse.json({ error: "You are not enrolled in this course." }, { status: 403 });
  let att = (await mdb.quizAttempt.findUnique({ where: { quizId_studentId: { quizId: quiz.id, studentId: st.id } } })) as Attempt | null;
  const now = Date.now();
  if (b.action === "start") {
    if (!att) {
      if (now < quiz.opensAt.getTime()) return NextResponse.json({ error: "The quiz has not opened yet." }, { status: 400 });
      if (now > quiz.closesAt.getTime()) return NextResponse.json({ error: "The quiz has closed." }, { status: 400 });
      const course = await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { code: true } });
      const author = await prisma.user.findUnique({ where: { id: (quiz as Quiz & { createdById: string }).createdById }, select: { id: true, role: true, managedById: true } });
      const chairmanId = author ? await chairmanIdFor(author) : "";
      const bank = (await mdb.mcqQuestion.findMany({ where: { chairmanId, courseCode: course!.code } })) as Q[];
      const ids = pick(quiz, bank);
      if (!ids.length) return NextResponse.json({ error: "This quiz has no questions yet. Tell your teacher." }, { status: 400 });
      const order: Record<string, number[]> = {};
      for (const q of bank.filter((x) => ids.includes(x.id))) { const n = (JSON.parse(q.optionsJson) as string[]).length; const o = Array.from({ length: n }, (_, i) => i); if (quiz.shuffle) for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } order[q.id] = o; }
      try { att = (await mdb.quizAttempt.create({ data: { quizId: quiz.id, studentId: st.id, questionIdsJson: JSON.stringify(ids), orderJson: JSON.stringify(order) } })) as Attempt; }
      catch { att = (await mdb.quizAttempt.findUnique({ where: { quizId_studentId: { quizId: quiz.id, studentId: st.id } } })) as Attempt; }
    }
    return NextResponse.json({ ok: true });
  }
  if (!att) return NextResponse.json({ error: "Start the quiz first." }, { status: 400 });
  if (att.submittedAt) return NextResponse.json({ error: "Already submitted." }, { status: 400 });
  const late = now > deadlineOf(att, quiz).getTime() + 60000;
  if (b.action === "save" || b.action === "submit") {
    if (!late && b.answers && typeof b.answers === "object") {
      const ids = new Set(JSON.parse(att.questionIdsJson) as string[]);
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.answers as Record<string, unknown>)) if (ids.has(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) < 6) clean[k] = v as number;
      att = (await mdb.quizAttempt.update({ where: { id: att.id }, data: { answersJson: JSON.stringify(clean) } })) as Attempt;
    }
    if (b.action === "submit" || late) { const g = await finishAttempt(att, quiz); return NextResponse.json({ ok: true, submitted: true, ...(quiz.showResults ? { score: g.score, max: g.max } : {}) }); }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
export const POST = withErrors(POST_handler);
