import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import CourseExitForm from "../../../components/CourseExitForm";
import { idb } from "../../../lib/indirectPlo";
import EvalForm from "../../../components/EvalForm";
import { evdb, EVAL } from "../../../lib/evaluations";
import { questionsFor, settingsFor, windowOf } from "../../../lib/questionnaires";
import { instituteOfBatch } from "../../../lib/moduleLocks";

export const dynamic = "force-dynamic";

// Course-exit survey: students rate how well they can now do each course outcome.
export default async function CourseSurveyPage({ searchParams }: { searchParams: { course?: string } }) {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE" }, select: { course: { select: { id: true, code: true, title: true } } }, orderBy: { course: { code: "asc" } } });
  const done = ((await idb.courseExitResponse.findMany({ where: { studentId: st.id }, select: { courseId: true, ratingsJson: true } }).catch(() => [])) as { courseId: string; ratingsJson: string }[]);
  const doneMap = new Map(done.map((d) => [d.courseId, d.ratingsJson]));
  const sel = enr.find((e) => e.course.id === searchParams.course)?.course;
  const evals = sel ? ((await evdb.courseEvaluation.findMany({ where: { courseId: sel.id, studentId: st.id }, select: { kind: true } }).catch(() => [])) as { kind: string }[]) : [];
  // The institute's own questionnaires (QEC In-charge) and the feedback window.
  const chairmanId = await instituteOfBatch(st.batchId).catch(() => null);
  const [qCourse, qTeacher, fs] = await Promise.all([questionsFor(chairmanId, "COURSE"), questionsFor(chairmanId, "TEACHER"), settingsFor(chairmanId)]);
  const win = sel ? await windowOf(sel.id, fs) : null;
  let clos: { id: string; code: string; statement: string }[] = [];
  if (sel) { const all = await prisma.cLO.findMany({ where: { courseId: sel.id }, select: { id: true, code: true, statement: true, source: true }, orderBy: { code: "asc" } }); const inst = all.filter((c) => c.source === "INSTRUCTOR"); clos = (inst.length ? inst : all).map(({ id, code, statement }) => ({ id, code, statement })); }
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Course Surveys &amp; Evaluations</h1>
      <p className="small-note">At the end of each course, tell us how well you can now do what the course promised. Results are reported only as program totals, never with your name.</p>
      <div className="card">{enr.map((e) => <div key={e.course.id} style={{ padding: "3px 0" }}><Link href={`/student/course-survey?course=${e.course.id}`} style={{ fontWeight: sel?.id === e.course.id ? 700 : 400 }}>{e.course.code} {e.course.title}</Link> {doneMap.has(e.course.id) ? <span style={{ color: "#1F5E36", fontSize: 12 }}>✓ done</span> : <span className="small-note">pending</span>}</div>)}{!enr.length && <p className="small-note">No current courses.</p>}</div>
      {sel && <div className="card"><h3 style={{ marginTop: 0 }}>{sel.code} {sel.title}</h3>{clos.length ? <CourseExitForm courseId={sel.id} clos={clos} initial={doneMap.has(sel.id) ? JSON.parse(doneMap.get(sel.id)!) : null} /> : <p className="small-note">This course has no outcomes listed yet.</p>}
        {win && !win.open ? <p className="small-note" style={{ marginTop: 10 }}>Course and teacher feedback opens in week {fs.fromWeek} of the semester{win.opensOn ? ` (${win.opensOn})` : ""} and closes after week {fs.toWeek}{win.closesOn ? ` (${win.closesOn})` : ""}.</p> : <>
        <EvalForm courseId={sel.id} kind="COURSE" title={EVAL.COURSE.title} items={qCourse.map((q) => [q.key, q.text] as [string, string])} done={evals.some((e) => e.kind === "COURSE")} min={fs.minResponses} />
        <EvalForm courseId={sel.id} kind="TEACHER" title={EVAL.TEACHER.title} items={qTeacher.map((q) => [q.key, q.text] as [string, string])} done={evals.some((e) => e.kind === "TEACHER")} min={fs.minResponses} /></>}</div>}
    </StudentShell>
  );
}
