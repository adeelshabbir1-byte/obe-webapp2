import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import { mdb, fmt, type Quiz, type Attempt } from "../../../lib/mcq";

export const dynamic = "force-dynamic";

export default async function StudentQuizzes() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE" }, select: { course: { select: { id: true, code: true, title: true } } } });
  const cOf = new Map(enr.map((e) => [e.course.id, e.course]));
  const quizzes = ((await mdb.onlineQuiz.findMany({ where: { courseId: { in: Array.from(cOf.keys()) }, status: { in: ["PUBLISHED", "CLOSED"] } }, orderBy: { opensAt: "desc" } }).catch(() => [])) as Quiz[]);
  const atts = ((await mdb.quizAttempt.findMany({ where: { studentId: st.id, quizId: { in: quizzes.map((q) => q.id) } } }).catch(() => [])) as Attempt[]);
  const aOf = new Map(atts.map((a) => [a.quizId, a]));
  const now = Date.now();
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Online Quizzes</h1>
      <div className="card">
        <table><thead><tr><th>Course</th><th>Quiz</th><th>Window (PKT)</th><th>Status</th></tr></thead>
          <tbody>{quizzes.map((q) => { const a = aOf.get(q.id); const open = q.status === "PUBLISHED" && now >= q.opensAt.getTime() && now <= q.closesAt.getTime();
            const st2 = a?.submittedAt ? (q.showResults && a.score !== null ? `Done · ${a.score}/${a.maxScore}` : "Submitted") : a ? "In progress" : open ? "Open now" : now < q.opensAt.getTime() ? "Not open yet" : "Missed";
            return <tr key={q.id}><td>{cOf.get(q.courseId)?.code}</td><td><Link href={`/student/quizzes/${q.id}`}><b>{q.title}</b></Link><div className="small-note">{q.durationMin} minutes</div></td><td style={{ fontSize: 12.5 }}>{fmt(q.opensAt)} → {fmt(q.closesAt)}</td><td style={{ fontWeight: open && !a?.submittedAt ? 700 : 400 }}>{st2}</td></tr>; })}</tbody></table>
        {!quizzes.length && <p className="small-note">No quizzes yet.</p>}
      </div>
    </StudentShell>
  );
}
