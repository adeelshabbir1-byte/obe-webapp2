import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { requireInstructorCourse } from "../../../lib/instructorGuard";
import { alertStudents } from "../../../lib/messaging";
import { followersOf, mirrorInstrument } from "../../../lib/sectionLink";
import { fmt, mdb, parseLocal, parseBank, normClo, finishAttempt, pushMark, DIFF, BLOOM, type Quiz, type Attempt } from "../../../lib/mcq";
import { writeAuditLog } from "../../../lib/audit";
import { withErrors } from "../../../lib/apiHandler";

const s = (v: unknown, n = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// Instructor: the course's MCQ bank (shared by every section of the course code) and its online quizzes.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const course = await requireInstructorCourse(user, String(b.courseId || ""));
  if (!course || !user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const key = { chairmanId, courseCode: course.code };
  try {
    // ---- question bank
    if (b.action === "addQ" || b.action === "editQ") {
      const options = ["A", "B", "C", "D", "E", "F"].map((l) => s(b[`opt${l}`], 1000)).filter((x): x is string => !!x);
      const correct = "ABCDEF".indexOf(String(b.answer || ""));
      const stem = s(b.stem, 4000);
      if (!stem || options.length < 2 || correct < 0 || correct >= options.length) return NextResponse.json({ error: "Write the question, at least two options, and pick the correct one." }, { status: 400 });
      const data = { stem, optionsJson: JSON.stringify(options), correct, cloCode: s(b.cloCode, 20), topic: s(b.topic), difficulty: DIFF.some((d) => d[0] === b.difficulty) ? b.difficulty : "MEDIUM", bloom: BLOOM.includes(b.bloom) ? b.bloom : null, explanation: s(b.explanation, 2000) };
      if (b.action === "addQ") await mdb.mcqQuestion.create({ data: { ...key, ...data, createdById: user.id } });
      else await mdb.mcqQuestion.updateMany({ where: { id: String(b.id || ""), ...key }, data });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "toggleQ") { const q = await mdb.mcqQuestion.findFirst({ where: { id: String(b.id || ""), ...key } }); if (q) await mdb.mcqQuestion.update({ where: { id: q.id }, data: { active: !q.active } }); return NextResponse.json({ ok: true }); }
    if (b.action === "deleteQ") {
      const used = await mdb.quizAttempt.count({ where: { questionIdsJson: { contains: String(b.id || "") } } });
      if (used) { await mdb.mcqQuestion.updateMany({ where: { id: String(b.id || ""), ...key }, data: { active: false } }); return NextResponse.json({ ok: true, note: "Already used in a quiz, so it was retired instead of deleted." }); }
      await mdb.mcqQuestion.deleteMany({ where: { id: String(b.id || ""), ...key } }); return NextResponse.json({ ok: true });
    }
    if (b.action === "import") {
      const { rows, errors } = parseBank(String(b.csv || ""));
      if (!rows.length) return NextResponse.json({ error: errors[0] || "No questions found." }, { status: 400 });
      await mdb.mcqQuestion.createMany({ data: rows.slice(0, 2000).map((r) => ({ ...key, ...r, createdById: user.id })) });
      return NextResponse.json({ ok: true, added: rows.length, errors: errors.slice(0, 20) });
    }
    // ---- quizzes
    if (b.action === "saveQuiz") {
      const title = s(b.title, 160), opensAt = parseLocal(b.opensAt), closesAt = parseLocal(b.closesAt);
      if (!title || isNaN(+opensAt) || isNaN(+closesAt) || closesAt <= opensAt) return NextResponse.json({ error: "Give a title and an opening time before the closing time." }, { status: 400 });
      const pick: Record<string, number> = {};
      for (const [k, v] of Object.entries(b)) if (k.startsWith("n_") && Number(v) > 0) pick[k === "n_ANY" ? "ANY" : normClo(k.slice(2))] = Math.min(200, Math.floor(Number(v)));
      if (!Object.keys(pick).length) return NextResponse.json({ error: "Choose how many questions to draw from at least one CLO." }, { status: 400 });
      const inst = b.instrumentId ? await prisma.assessmentInstrument.findFirst({ where: { id: String(b.instrumentId), courseId: course.id } }) : null;
      const data = { title, opensAt, closesAt, durationMin: Math.max(1, Math.min(300, Number(b.durationMin) || 20)), pickJson: JSON.stringify(pick), shuffle: b.shuffle !== false, showResults: b.showResults !== false, negativePct: Math.max(0, Math.min(100, Number(b.negativePct) || 0)), instrumentId: inst?.id || null };
      if (b.id) { const started = await mdb.quizAttempt.count({ where: { quizId: String(b.id) } }); await mdb.onlineQuiz.updateMany({ where: { id: String(b.id), courseId: course.id }, data: started ? { title, closesAt, showResults: data.showResults, instrumentId: data.instrumentId } : data }); }
      else {
        await mdb.onlineQuiz.create({ data: { ...data, courseId: course.id, createdById: user.id } });
        // Teach as one: the same quiz goes to every linked section (its own copy, its own marks).
        for (const fid of await followersOf(course.id)) await mdb.onlineQuiz.create({ data: { ...data, instrumentId: await mirrorInstrument(data.instrumentId, fid), courseId: fid, createdById: user.id } });
      }
      return NextResponse.json({ ok: true });
    }
    const quiz = (await mdb.onlineQuiz.findFirst({ where: { id: String(b.quizId || ""), courseId: course.id } })) as Quiz | null;
    if (!quiz) return NextResponse.json({ error: "quiz not found" }, { status: 404 });
    if (b.action === "extendQuiz") {
      const closesAt = parseLocal(b.closesAt);
      if (isNaN(+closesAt) || closesAt <= quiz.opensAt) return NextResponse.json({ error: "Closing time must be after the opening time." }, { status: 400 });
      await mdb.onlineQuiz.update({ where: { id: quiz.id }, data: { title: s(b.title, 160) || quiz.title, closesAt, showResults: !!b.showResults } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "status") {
      const st = ["DRAFT", "PUBLISHED", "CLOSED"].includes(b.status) ? b.status : "DRAFT";
      await mdb.onlineQuiz.update({ where: { id: quiz.id }, data: { status: st } });
      const fids = await followersOf(course.id);
      if (fids.length) await mdb.onlineQuiz.updateMany({ where: { courseId: { in: fids }, title: quiz.title }, data: { status: st } });
      if (st === "PUBLISHED" && quiz.status === "DRAFT") {
        const ids = (await prisma.studentEnrollment.findMany({ where: { courseId: { in: [course.id, ...fids] }, status: "ACTIVE" }, select: { studentId: true } })).map((e) => e.studentId);
        await alertStudents(chairmanId, ids, "QUIZ", `${course.code}: ${quiz.title} is open`, `Online quiz, ${quiz.durationMin} min. Open until ${fmt(quiz.closesAt)} (PKT). Student portal → Online Quizzes.`).catch(() => null);
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "deleteQuiz") { if (await mdb.quizAttempt.count({ where: { quizId: quiz.id } })) return NextResponse.json({ error: "Students have attempted this quiz; close it instead." }, { status: 400 }); await mdb.onlineQuiz.delete({ where: { id: quiz.id } }); return NextResponse.json({ ok: true }); }
    if (b.action === "regrade") {
      // After fixing an answer key: re-score every submitted attempt and refresh marks; also closes attempts whose time ran out.
      const atts = (await mdb.quizAttempt.findMany({ where: { quizId: quiz.id } })) as Attempt[];
      let n = 0; for (const a of atts) if (a.submittedAt || Date.now() > a.startedAt.getTime() + quiz.durationMin * 60000) { await finishAttempt(a, quiz); n++; }
      await writeAuditLog({ actorUserId: user.id, action: "QUIZ_REGRADED", entityType: "OnlineQuiz", entityId: quiz.id, metadata: { attempts: n } });
      return NextResponse.json({ ok: true, regraded: n });
    }
    if (b.action === "reset") { await mdb.quizAttempt.deleteMany({ where: { quizId: quiz.id, studentId: String(b.studentId || "") } }); await writeAuditLog({ actorUserId: user.id, action: "QUIZ_ATTEMPT_RESET", entityType: "OnlineQuiz", entityId: quiz.id, metadata: { studentId: String(b.studentId || "") } }); return NextResponse.json({ ok: true }); }
    if (b.action === "push") { const atts = (await mdb.quizAttempt.findMany({ where: { quizId: quiz.id, submittedAt: { not: null } } })) as Attempt[]; let n = 0; for (const a of atts) if (a.score !== null && (await pushMark(quiz, a.studentId, a.score, a.maxScore || 0))) n++; return NextResponse.json({ ok: true, pushed: n }); }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Online quizzes are not set up yet — run prisma/migration_mcq.sql." }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
