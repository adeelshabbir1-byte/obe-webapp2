import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import StudentShell from "../../../../components/StudentShell";
import QuizTaker from "../../../../components/QuizTaker";
import QuizStart from "../../../../components/QuizStart";
import { mdb, fmt, deadlineOf, expired, finishAttempt, letter, type Quiz, type Attempt, type Q } from "../../../../lib/mcq";

export const dynamic = "force-dynamic";

export default async function TakeQuiz({ params }: { params: { id: string } }) {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const quiz = (await mdb.onlineQuiz.findUnique({ where: { id: params.id } }).catch(() => null)) as Quiz | null;
  if (!quiz || quiz.status === "DRAFT") notFound();
  const enr = await prisma.studentEnrollment.findUnique({ where: { studentId_courseId: { studentId: st.id, courseId: quiz.courseId } } });
  if (!enr) notFound();
  const course = await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { code: true, title: true } });
  let att = (await mdb.quizAttempt.findUnique({ where: { quizId_studentId: { quizId: quiz.id, studentId: st.id } } })) as Attempt | null;
  if (att && expired(att, quiz)) { await finishAttempt(att, quiz); att = (await mdb.quizAttempt.findUnique({ where: { id: att.id } })) as Attempt; }
  const now = Date.now();
  const head = <><p><Link href="/student/quizzes">← Quizzes</Link></p><h1 style={{ fontSize: 21, marginBottom: 2 }}>{quiz.title}</h1><p className="small-note">{course?.code} {course?.title} · {quiz.durationMin} minutes · open {fmt(quiz.opensAt)} → {fmt(quiz.closesAt)} (PKT){quiz.negativePct ? ` · wrong answers cost ${quiz.negativePct}% of a mark` : ""}</p></>;
  let body: React.ReactNode;
  if (!att) {
    const open = quiz.status === "PUBLISHED" && now >= quiz.opensAt.getTime() && now <= quiz.closesAt.getTime();
    body = open ? <div className="card"><p>When you start, the timer runs for {quiz.durationMin} minutes and cannot be paused. Your answers are saved as you go and submitted automatically when time is up. You get one attempt.</p><QuizStart quizId={quiz.id} label="Start quiz" /></div>
      : <div className="card">{now < quiz.opensAt.getTime() ? `Opens ${fmt(quiz.opensAt)}.` : "This quiz is closed."}</div>;
  } else if (!att.submittedAt) {
    const ids = JSON.parse(att.questionIdsJson) as string[]; const order = JSON.parse(att.orderJson) as Record<string, number[]>;
    const qs = new Map(((await mdb.mcqQuestion.findMany({ where: { id: { in: ids } } })) as Q[]).map((q) => [q.id, q]));
    const items = ids.filter((id) => qs.has(id)).map((id) => { const q = qs.get(id)!; const opts = JSON.parse(q.optionsJson) as string[]; return { id, stem: q.stem, options: (order[id] || opts.map((_, i) => i)).map((i) => ({ i, text: opts[i] })) }; });
    body = <QuizTaker quizId={quiz.id} items={items} saved={JSON.parse(att.answersJson)} deadline={deadlineOf(att, quiz).getTime()} />;
  } else {
    const review = quiz.showResults && now > quiz.closesAt.getTime();
    const ids = JSON.parse(att.questionIdsJson) as string[]; const ans = JSON.parse(att.answersJson) as Record<string, number>;
    const qs = review ? ((await mdb.mcqQuestion.findMany({ where: { id: { in: ids } } })) as Q[]) : [];
    const per = JSON.parse(att.perCloJson || "{}") as Record<string, [number, number]>;
    body = <>
      <div className="card"><b>Submitted {fmt(att.submittedAt)}.</b> {quiz.showResults ? <>Score: <b>{att.score}/{att.maxScore}</b>. {Object.entries(per).sort().map(([c, [g, n]]) => `${c}: ${g}/${n}`).join(" · ")}</> : "Your teacher will release the result."}
        {quiz.showResults && !review && <p className="small-note">Correct answers appear here after the quiz closes on {fmt(quiz.closesAt)}.</p>}</div>
      {review && ids.map((id, n) => { const q = qs.find((x) => x.id === id); if (!q) return null; const opts = JSON.parse(q.optionsJson) as string[]; return (
        <div key={id} className="card" style={{ fontSize: 13.5 }}><div><b>{n + 1}.</b> {q.stem}</div>
          {opts.map((o, i) => <div key={i} style={{ color: i === q.correct ? "#1F5E36" : i === ans[id] ? "#B3261E" : undefined, fontWeight: i === q.correct || i === ans[id] ? 700 : 400 }}>{letter(i)}. {o}{i === q.correct ? " ✓" : i === ans[id] ? " ✗ your answer" : ""}</div>)}
          {ans[id] === undefined && <div className="small-note">Not answered</div>}{q.explanation && <div className="small-note" style={{ marginTop: 4 }}>{q.explanation}</div>}</div>); })}
    </>;
  }
  return <StudentShell studentName={st.name}>{head}{body}</StudentShell>;
}
