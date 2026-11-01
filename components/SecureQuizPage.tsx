import { headers } from "next/headers";
import Link from "next/link";
import SecureQuizTaker from "./SecureQuizTaker";
import MathText from "./MathText";
import { gate, results, settingsOf } from "../lib/quizzes";
import { fmt } from "../lib/mcq";
import { prisma } from "../lib/db";

// A secure quiz's page for the student: Safe Exam Browser when required (else "Open this quiz in Safe Exam Browser"
// with the .seb file), a computer when required, then the quiz — or the result once submitted.
export default async function SecureQuizPage({ student, quiz }: { student: { id: string }; quiz: { id: string; title: string; courseId: string; durationMin: number; opensAt: Date; closesAt: Date } }) {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "http";
  const url = `${proto}://${host}/student/quizzes/${quiz.id}`;
  const s = (await settingsOf(quiz.id))!;
  const g = await gate(student, quiz.id, { url, ua: h.get("user-agent") || "", configHash: h.get("x-safeexambrowser-configkeyhash"), requestHash: h.get("x-safeexambrowser-requesthash") });
  const course = await prisma.course.findUnique({ where: { id: quiz.courseId }, select: { code: true, title: true } });
  const head = <><p><Link href="/student/quizzes">← Quizzes</Link></p><h1 style={{ fontSize: 21, marginBottom: 2 }}>{quiz.title}</h1><p className="small-note">{course?.code} {course?.title} · {quiz.durationMin} minutes · open {fmt(quiz.opensAt)} → {fmt(quiz.closesAt)} (PKT){s.attempts > 1 ? ` · ${s.attempts} attempts` : ""}</p></>;
  if ("error" in g) return <>{head}<div className="card" data-quiz-blocked><b>{g.error}</b>{(g as { seb?: boolean }).seb && <p>Install Safe Exam Browser (free), then open <a href={`/api/quiz-secure?seb=${quiz.id}`} data-seb-file>this quiz&apos;s .seb file</a>. <Link href="/student/safe-exam-browser">How to</Link>.</p>}</div></>;
  const db = prisma as unknown as Record<string, any>;
  const runs = (await db.quizRun.findMany({ where: { quizId: quiz.id, studentId: student.id }, orderBy: { attemptNo: "asc" } })) as { submittedAt: Date | null }[];
  const openRun = runs.some((r) => !r.submittedAt);
  const makeup = await db.quizMakeup.findFirst({ where: { quizId: quiz.id, studentId: student.id, used: false, until: { gt: new Date() } } });
  const canStart = openRun || !!makeup || (runs.length < s.attempts && Date.now() >= quiz.opensAt.getTime() && Date.now() <= quiz.closesAt.getTime());
  const res = runs.some((r) => r.submittedAt) ? await results(student, quiz.id) : null;
  const intro = `When you start, the quiz opens full-screen and the timer runs for ${quiz.durationMin} minutes. Leaving full-screen, switching to another tab or app, or the window losing focus is recorded and your teacher sees it${s.rule === "AUTO" ? `; after ${s.autoAfter} times the quiz is submitted for you` : s.rule === "WARN" ? "; you are warned each time" : ""}. Copy, paste, right-click and printing are blocked. Your answers are saved after every question; if your connection drops, open the quiz again within the time and carry on — the lost time is added back.${s.noBack ? " You cannot go back to a question once you move on." : ""}${makeup ? " This is your make-up attempt (different questions)." : ""}`;
  return <>{head}
    {res && !res.hidden && <div className="card" data-quiz-result><b>Score: {res.score}/{res.max}</b>{res.pending ? ` · ${res.pending} answer(s) still to be marked` : ""}<div className="small-note">{Object.entries(res.perClo || {}).map(([c, [g2, n]]) => `${c}: ${g2}/${n}`).join(" · ")}</div>
      {res.wrong?.length ? <div style={{ marginTop: 6 }}><b style={{ fontSize: 13 }}>Questions you got wrong</b>{res.wrong.map((w) => <div key={w.id} style={{ fontSize: 13, marginTop: 4 }} data-wrong><MathText text={w.text} /> <span className="small-note">{w.got}/{w.marks}</span>{w.answer ? <div className="small-note">Answer: <MathText text={w.answer} /></div> : null}</div>)}</div> : null}</div>}
    {res?.hidden && <div className="card">{res.message}</div>}
    {canStart ? <SecureQuizTaker quizId={quiz.id} intro={intro} /> : !res && <div className="card">{Date.now() < quiz.opensAt.getTime() ? `Opens ${fmt(quiz.opensAt)}.` : "This quiz is closed."}</div>}
  </>;
}
