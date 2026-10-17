import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import SubmitWork from "../../../components/SubmitWork";
import { pdb } from "../../../lib/portfolio";
import { fmt } from "../../../lib/mcq";

export const dynamic = "force-dynamic";
type Box = { id: string; courseId: string; instrumentId: string | null; title: string; instructions: string | null; dueAt: Date; allowLate: boolean; status: string };
type Sub = { id: string; dropboxId: string; fileName: string; fileUrl: string; submittedAt: Date; late: boolean; score: number | null; feedback: string | null; gradedAt: Date | null };

export default async function StudentSubmissions() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE" }, select: { course: { select: { id: true, code: true, title: true } } } });
  const cOf = new Map(enr.map((e) => [e.course.id, e.course]));
  const boxes = ((await pdb.dropbox.findMany({ where: { courseId: { in: Array.from(cOf.keys()) } }, orderBy: { dueAt: "asc" } }).catch(() => [])) as Box[]);
  const subs = ((await pdb.submission.findMany({ where: { studentId: st.id, dropboxId: { in: boxes.map((b) => b.id) } } }).catch(() => [])) as Sub[]);
  const sOf = new Map(subs.map((s) => [s.dropboxId, s]));
  const max = new Map((await prisma.assessmentInstrument.findMany({ where: { id: { in: boxes.map((b) => b.instrumentId).filter((x): x is string => !!x) } }, select: { id: true, maxScore: true } })).map((i) => [i.id, i.maxScore]));
  const now = Date.now();
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>Submit Work</h1>
      <p className="small-note">Hand in assignments, projects and lab reports. You can replace your file until it is graded. Times are Pakistan time.</p>
      {boxes.map((b) => { const s = sOf.get(b.id); const open = b.status === "OPEN" && (now <= b.dueAt.getTime() || b.allowLate); return (
        <div key={b.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}><b>{cOf.get(b.courseId)?.code} · {b.title}</b><span style={{ fontSize: 13, color: now > b.dueAt.getTime() ? "#B3261E" : undefined }}>Due {fmt(b.dueAt)}{!b.allowLate ? " · no late work" : ""}</span></div>
          {b.instructions && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", margin: "4px 0" }}>{b.instructions}</div>}
          {s && <div style={{ fontSize: 13 }}>Your file: <a href={s.fileUrl} target="_blank" rel="noopener noreferrer">{s.fileName}</a> <span className="small-note">{fmt(s.submittedAt)}{s.late ? " · late" : ""}</span></div>}
          {s?.gradedAt && <div style={{ fontSize: 13.5, marginTop: 4 }}><b>{s.score !== null ? `Score: ${s.score}${b.instrumentId && max.get(b.instrumentId) ? `/${max.get(b.instrumentId)}` : ""}` : "Reviewed"}</b>{s.feedback ? ` — ${s.feedback}` : ""}</div>}
          {open && !s?.gradedAt ? <SubmitWork boxId={b.id} label={s ? "Replace file" : now > b.dueAt.getTime() ? "Submit late" : "Submit"} /> : !s && <div className="small-note">Closed.</div>}
        </div>); })}
      {!boxes.length && <div className="card small-note">Nothing to submit right now.</div>}
    </StudentShell>
  );
}
