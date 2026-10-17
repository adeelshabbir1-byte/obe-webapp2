import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../components/reportNav";
import { ActionForm, ActionButton } from "../../../../../components/fyp/FypClient";
import { pdb } from "../../../../../lib/portfolio";
import { fmt, inputValue } from "../../../../../lib/mcq";

export const dynamic = "force-dynamic";
type Box = { id: string; instrumentId: string | null; title: string; instructions: string | null; dueAt: Date; allowLate: boolean; status: string };
type Sub = { id: string; dropboxId: string; studentId: string; fileName: string; fileUrl: string; note: string | null; submittedAt: Date; late: boolean; score: number | null; feedback: string | null; gradedAt: Date | null };

// Hand-in points for the course; open one to see who submitted, grade with feedback, and keep good/average/weak work as samples.
export default async function SubmissionsPage({ params, searchParams }: { params: { courseId: string }; searchParams: { box?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  const shell = (c: React.ReactNode) => <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}><InstructorCourseSubNav courseId={course.id} active="submissions" code={course.code} title={course.title} />{c}</Shell>;
  const boxes = ((await pdb.dropbox.findMany({ where: { courseId: course.id }, orderBy: { dueAt: "desc" } }).catch(() => null)) as Box[] | null);
  if (boxes === null) return shell(<div className="err">Online submissions are not set up yet — run prisma/migration_submissions.sql.</div>);
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, label: true, type: true, maxScore: true }, orderBy: [{ type: "asc" }, { label: "asc" }] });
  const iOf = new Map(insts.map((i) => [i.id, i]));
  const subs = (await pdb.submission.findMany({ where: { dropboxId: { in: boxes.map((b) => b.id) } } })) as Sub[];
  const enr = await prisma.studentEnrollment.findMany({ where: { courseId: course.id, status: "ACTIVE" }, select: { student: { select: { id: true, name: true, rollNumber: true } } }, orderBy: { student: { rollNumber: "asc" } } });
  const sel = boxes.find((b) => b.id === searchParams.box);
  const boxFields = [{ name: "title", label: "Title", width: 200 }, { name: "instrumentId", label: "Marks go to", type: "select" as const, options: [["", "— not linked —"], ...insts.map((i) => [i.id, `${i.label} (/${i.maxScore})`] as [string, string])] as [string, string][] }, { name: "dueAt", label: "Due (PKT)", type: "datetime-local" as const }, { name: "allowLate", label: "Accept late work (marked late)", type: "checkbox" as const }, { name: "instructions", label: "Instructions", type: "textarea" as const }];
  return shell(<>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Online submissions</h3>
      <ActionForm url="/api/submissions" fixed={{ action: "saveBox", courseId: course.id }} submit="Open hand-in" collapsed openLabel="New hand-in" initial={{ dueAt: inputValue(new Date(Date.now() + 7 * 86400000)), allowLate: true, instrumentId: insts.find((i) => i.type === "Assignment")?.id || "" }} fields={boxFields} />
      <table style={{ marginTop: 8 }}><thead><tr><th>Hand-in</th><th>Due</th><th>Submitted</th><th>Graded</th><th>Status</th><th /></tr></thead>
        <tbody>{boxes.map((b) => { const bs = subs.filter((s) => s.dropboxId === b.id); return (
          <tr key={b.id}><td><Link href={`/instructor/courses/${course.id}/submissions?box=${b.id}`}><b>{b.title}</b></Link><div className="small-note">{b.instrumentId ? iOf.get(b.instrumentId)?.label : "not linked to marks"}</div></td><td style={{ fontSize: 12.5 }}>{fmt(b.dueAt)}</td><td>{bs.length}/{enr.length}{bs.some((s) => s.late) ? <span className="small-note"> ({bs.filter((s) => s.late).length} late)</span> : null}</td><td>{bs.filter((s) => s.gradedAt).length}</td><td>{b.status === "OPEN" ? "Open" : "Closed"}</td>
            <td>{b.status === "OPEN" ? <ActionButton url="/api/submissions" body={{ courseId: course.id, boxId: b.id, action: "status", status: "CLOSED" }} label="Close" className="btn btn-secondary btn-sm" /> : <ActionButton url="/api/submissions" body={{ courseId: course.id, boxId: b.id, action: "status", status: "OPEN" }} label="Reopen" className="btn btn-secondary btn-sm" />} {!bs.length && <ActionButton url="/api/submissions" body={{ courseId: course.id, boxId: b.id, action: "deleteBox" }} label="Delete" className="btn btn-secondary btn-sm" confirmText="Delete this hand-in?" />}</td></tr>); })}</tbody></table>
      {!boxes.length && <p className="small-note">Open a hand-in for an assignment, project or lab report. Students upload from their portal; you grade here and the score goes into the marks sheet.</p>}
    </div>
    {sel && (() => { const inst = sel.instrumentId ? iOf.get(sel.instrumentId) : undefined; const sOf = new Map(subs.filter((s) => s.dropboxId === sel.id).map((s) => [s.studentId, s])); return (
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}><h3 style={{ margin: 0 }}>{sel.title}</h3><ActionForm url="/api/submissions" fixed={{ action: "saveBox", courseId: course.id, id: sel.id }} submit="Save" collapsed openLabel="Edit" initial={{ title: sel.title, instrumentId: sel.instrumentId || "", dueAt: inputValue(sel.dueAt), allowLate: sel.allowLate, instructions: sel.instructions || "" }} fields={boxFields} /></div>
        <table><thead><tr><th>Student</th><th>File</th><th>Grade{inst ? ` (/${inst.maxScore})` : ""}</th><th>Keep as sample</th></tr></thead>
          <tbody>{enr.map(({ student: st }) => { const s = sOf.get(st.id); return (
            <tr key={st.id}><td>{st.rollNumber} {st.name}</td>
              <td>{s ? <><a href={s.fileUrl} target="_blank" rel="noopener noreferrer">{s.fileName}</a><div className="small-note">{fmt(s.submittedAt)}{s.late ? " · LATE" : ""}{s.note ? ` · ${s.note}` : ""}</div></> : <span style={{ color: "#B3261E" }}>not submitted</span>}</td>
              <td>{s && <ActionForm url="/api/submissions" fixed={{ action: "grade", courseId: course.id, boxId: sel.id, subId: s.id }} submit={s.gradedAt ? "Update" : "Grade"} initial={{ score: s.score ?? "", feedback: s.feedback || "" }} fields={[{ name: "score", label: "Score", type: "number", width: 70 }, { name: "feedback", label: "Feedback", width: 220 }]} />}</td>
              <td>{s && inst && <div style={{ display: "flex", gap: 4 }}>{[["HIGH", "Best"], ["MEDIUM", "Avg"], ["LOW", "Weak"]].map(([l, n]) => <ActionButton key={l} url="/api/submissions" body={{ action: "sample", courseId: course.id, boxId: sel.id, subId: s.id, level: l }} label={n} className="btn btn-secondary btn-sm" />)}</div>}</td></tr>); })}</tbody></table>
      </div>); })()}
  </>);
}
