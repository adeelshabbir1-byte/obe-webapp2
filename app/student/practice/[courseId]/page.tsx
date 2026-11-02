import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import StudentShell from "../../../../components/StudentShell";
import { studentPractice } from "../../../../lib/practicePool";
import PracticeSet from "../../../../components/PracticeSet";
import { forStudent, KINDS } from "../../../../lib/topicResources";

export const dynamic = "force-dynamic";

// Self-practice for a CLO not cleared yet: questions the course's Subject Expert released for practice. Nothing is
// recorded or graded; the answer is shown after the student tries.
export default async function PracticePage({ params, searchParams }: { params: { courseId: string }; searchParams: { clo?: string } }) {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const clo = String(searchParams.clo || "").slice(0, 20);
  const r = await studentPractice(st.id, params.courseId, clo).catch(() => null);
  if (!r) redirect("/student/my-clos");
  const res = await forStudent(params.courseId, clo).catch(() => []);
  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/student/my-clos" className="small-note">← My CLOs</Link>
        <h1 style={{ fontSize: 22 }}>Practice and resources — {r.course.code} {r.course.title}</h1>
        <p className="small-note">Questions your Subject Expert released for practice. Nothing here is graded or recorded; try each one, then check the answer.</p>
        {r.clos.length > 1 && <p style={{ fontSize: 13 }}>CLO: <Link href={`/student/practice/${r.course.id}`} style={{ fontWeight: clo ? 400 : 700 }}>All</Link>{r.clos.map((c) => <span key={c}> · <Link href={`/student/practice/${r.course.id}?clo=${encodeURIComponent(c)}`} style={{ fontWeight: clo === c ? 700 : 400 }}>{c}</Link></span>)}</p>}
        {res.length > 0 && <div className="card" data-resources><h3 style={{ marginTop: 0, fontSize: 15 }}>Learn it again{clo ? ` — ${clo}` : ""}</h3><ul style={{ fontSize: 13.5 }}>{res.map((x) => <li key={x.id}>{KINDS[x.kind] || x.kind}: {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> : x.title} <span className="small-note">(L{x.lectureNumber} {x.topic}{x.note ? ` — ${x.note}` : ""})</span></li>)}</ul></div>}
        {r.questions.length === 0 ? <div className="card"><p>No practice questions {clo ? `for ${clo} ` : ""}yet. Ask your teacher for a tutorial or practice sheet.</p></div> : <PracticeSet questions={r.questions} />}
      </div>
    </StudentShell>
  );
}
