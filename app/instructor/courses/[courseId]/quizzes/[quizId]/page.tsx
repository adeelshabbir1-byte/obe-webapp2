import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import Shell from "../../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../../components/reportNav";
import { ActionForm, ActionButton } from "../../../../../../components/fyp/FypClient";
import { mdb, itemAnalysis, letter, fmt, inputValue, expired, type Quiz, type Attempt, type Q } from "../../../../../../lib/mcq";

export const dynamic = "force-dynamic";

// One quiz: who took it, scores, CLO results, and item analysis to spot weak or wrongly-keyed questions.
export default async function QuizResults({ params }: { params: { courseId: string; quizId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || user.role !== "INSTRUCTOR" || course.instructorId !== user.id) notFound();
  const quiz = (await mdb.onlineQuiz.findFirst({ where: { id: params.quizId, courseId: course.id } })) as Quiz | null;
  if (!quiz) notFound();
  const atts = (await mdb.quizAttempt.findMany({ where: { quizId: quiz.id } })) as Attempt[];
  const qIds = Array.from(new Set(atts.flatMap((a) => JSON.parse(a.questionIdsJson) as string[])));
  const qs = (await mdb.mcqQuestion.findMany({ where: { id: { in: qIds } } })) as Q[];
  const enr = await prisma.studentEnrollment.findMany({ where: { courseId: course.id }, select: { student: { select: { id: true, name: true, rollNumber: true } } } });
  const aOf = new Map(atts.map((a) => [a.studentId, a]));
  const items = itemAnalysis(atts, qs);
  const done = atts.filter((a) => a.submittedAt && a.maxScore);
  const avg = done.length ? Math.round((1000 * done.reduce((s, a) => s + a.score! / a.maxScore!, 0)) / done.length) / 10 : null;
  const clo = new Map<string, [number, number]>();
  for (const a of done) for (const [c, [g, n]] of Object.entries(JSON.parse(a.perCloJson || "{}") as Record<string, [number, number]>)) { const v = clo.get(c) || [0, 0]; v[0] += g; v[1] += n; clo.set(c, v); }
  const pending = atts.filter((a) => expired(a, quiz)).length;
  return (
    <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}>
      <InstructorCourseSubNav courseId={course.id} active="quizzes" code={course.code} title={course.title} />
      <p><Link href={`/instructor/courses/${course.id}/quizzes`}>← All quizzes</Link></p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{quiz.title}</h3>
        <p className="small-note">{fmt(quiz.opensAt)} → {fmt(quiz.closesAt)} · {quiz.durationMin} min · {done.length}/{enr.length} submitted · class average {avg ?? "—"}%{quiz.negativePct ? ` · negative marking ${quiz.negativePct}%` : ""}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton url="/api/mcq" body={{ courseId: course.id, quizId: quiz.id, action: "regrade" }} label={pending ? `Regrade (and close ${pending} timed-out)` : "Regrade all"} className="btn btn-secondary btn-sm" />
          <ActionButton url="/api/mcq" body={{ courseId: course.id, quizId: quiz.id, action: "push" }} label="Copy scores to marks again" className="btn btn-secondary btn-sm" />
          <ActionForm url="/api/mcq" fixed={{ action: "extendQuiz", courseId: course.id, quizId: quiz.id }} submit="Save" collapsed openLabel="Extend / rename" initial={{ title: quiz.title, closesAt: inputValue(quiz.closesAt), showResults: quiz.showResults }}
            fields={[{ name: "title", label: "Title" }, { name: "closesAt", label: "Closes (PKT)", type: "datetime-local" }, { name: "showResults", label: "Show score to students", type: "checkbox" }]} />
        </div>
        {clo.size > 0 && <p style={{ fontSize: 13 }}>CLO results: {Array.from(clo.entries()).sort().map(([c, [g, n]]) => `${c} ${Math.round((100 * g) / n)}%`).join(" · ")}</p>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Student</th><th>Started</th><th>Submitted</th><th>Score</th><th /></tr></thead>
          <tbody>{enr.map(({ student: s }) => { const a = aOf.get(s.id); return (
            <tr key={s.id}><td>{s.rollNumber} {s.name}</td><td>{a ? fmt(a.startedAt) : "—"}</td><td>{a?.submittedAt ? fmt(a.submittedAt) : a ? (expired(a, quiz) ? "time up" : "in progress") : "—"}</td><td>{a?.score != null ? `${a.score}/${a.maxScore}` : "—"}</td>
              <td>{a && <ActionButton url="/api/mcq" body={{ courseId: course.id, quizId: quiz.id, action: "reset", studentId: s.id }} label="Allow retake" className="btn btn-secondary btn-sm" confirmText={`Delete ${s.name}'s attempt so they can take it again?`} />}</td></tr>); })}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Item analysis</h3>
        <p className="small-note">Correct % = how many got it right. Discrimination = top 27% minus bottom 27% (above 0.3 is good). If a question looks wrongly keyed, fix it in the bank and press Regrade.</p>
        <table><thead><tr><th>Question</th><th>CLO</th><th>Seen</th><th>Correct %</th><th>Discrimination</th><th>Answers chosen</th><th /></tr></thead>
          <tbody>{qs.map((q) => { const it = items.find((x) => x.id === q.id)!; const opts = JSON.parse(q.optionsJson) as string[]; return (
            <tr key={q.id}><td style={{ maxWidth: 360 }}>{q.stem}</td><td>{q.cloCode || "—"}</td><td>{it.seen}</td><td>{it.p ?? "—"}</td><td>{it.d ?? "—"}</td>
              <td style={{ fontSize: 12 }}>{opts.map((_, i) => <span key={i} style={{ marginRight: 8, fontWeight: i === q.correct ? 700 : 400, color: i === q.correct ? "#1F5E36" : undefined }}>{letter(i)}:{it.spread[i] || 0}</span>)}{it.blank ? <span className="small-note">blank:{it.blank}</span> : null}</td>
              <td style={{ color: "#B3261E", fontSize: 12 }}>{it.flag}</td></tr>); })}</tbody></table>
        {!qs.length && <p className="small-note">No attempts yet.</p>}
      </div>
    </Shell>
  );
}
