import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import { withErrors } from "../../../lib/apiHandler";
import { createQuiz, makeup, markAnswer, monitor, sebFile, quizBank, settingsOf } from "../../../lib/quizzes";
import { eventLine } from "../../../lib/quizCore";

// Secure quizzes, the teacher's side. GET ?monitor=<quizId> the live monitor · ?seb=<quizId> the .seb file (the
// teacher or an enrolled student) · ?bank=<courseId> the questions a quiz can use. POST { action: create | makeup | mark }.
const db = prisma as unknown as Record<string, any>;
async function teacherOf(quizId: string, userId: string) {
  const q = await db.onlineQuiz.findUnique({ where: { id: quizId } });
  const c = q ? await prisma.course.findUnique({ where: { id: q.courseId }, select: { instructorId: true } }) : null;
  return q && c?.instructorId === userId ? q : null;
}
async function GET_handler(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("seb")) {
    const quizId = String(sp.get("seb"));
    const user = await getAuthenticatedUser();
    const st = user ? null : await getAuthenticatedStudent();
    const quiz = await db.onlineQuiz.findUnique({ where: { id: quizId } });
    if (!quiz) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const ok = (user && (await teacherOf(quizId, user.id))) || (st && (await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId: quiz.courseId } } })));
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
    const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
    try { return new NextResponse(await sebFile(quizId, `${proto}://${host}`), { headers: { "Content-Type": "application/seb", "Content-Disposition": `attachment; filename="quiz-${quizId.slice(0, 8)}.seb"` } }); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "INSTRUCTOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (sp.get("monitor")) {
    const quiz = await teacherOf(String(sp.get("monitor")), user.id);
    if (!quiz) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const rows = await monitor(quiz.id);
    return NextResponse.json({ settings: await settingsOf(quiz.id), rows: rows.map((r) => ({ id: r.id, attemptNo: r.attemptNo, makeup: r.makeup, student: r.student, startedAt: r.startedAt, submittedAt: r.submittedAt, autoSubmitted: r.autoSubmitted, flagged: r.flagged, events: r.events, lostMs: r.lostMs, score: r.score, maxScore: r.maxScore, pending: r.pending, answers: JSON.parse(r.answersJson || "{}"), teacher: JSON.parse(r.teacherJson || "{}"), questionIds: JSON.parse(r.questionIdsJson || "[]"), line: eventLine(r.student?.name || "", r.events.map((e) => ({ ...e, at: new Date(e.at) })) as never), log: r.events })) });
  }
  if (sp.get("bank")) {
    const c = await prisma.course.findUnique({ where: { id: String(sp.get("bank")) }, select: { instructorId: true } });
    if (c?.instructorId !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const bank = await quizBank({ courseId: String(sp.get("bank")), createdById: user.id });
    return NextResponse.json({ items: bank.map((q) => ({ id: q.id, type: q.type, text: q.text, cloCodes: q.cloCodes, bloom: q.bloom, difficulty: q.difficulty, marks: q.marks })) });
  }
  return NextResponse.json({ error: "Unknown." }, { status: 400 });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "INSTRUCTOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "create": return NextResponse.json(await createQuiz(user, String(b.courseId || ""), b));
      case "makeup": {
        let studentId = String(b.studentId || "");
        if (!studentId && b.rollNumber) { const s = await prisma.student.findFirst({ where: { rollNumber: String(b.rollNumber).trim() }, select: { id: true } }); if (!s) throw new Error("No student with that roll number."); studentId = s.id; }
        return NextResponse.json(await makeup(user, String(b.quizId || ""), studentId, String(b.reason || "")));
      }
      case "mark": return NextResponse.json(await markAnswer(user, String(b.runId || ""), String(b.questionId || ""), Number(b.marks) || 0));
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { if ((e as { code?: string }).code) throw e; return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
