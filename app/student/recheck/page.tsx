import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { prisma } from "../../../lib/db";
import { publications, xdb } from "../../../lib/examController";
import { ActionForm } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

export default async function StudentRecheck() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const en = await prisma.studentEnrollment.findMany({ where: { studentId: st.id }, select: { courseId: true, course: { select: { code: true, title: true } } } });
  const pub = await publications(en.map((e) => e.courseId));
  const mine = (await xdb.resultRecheck.findMany({ where: { studentId: st.id } }).catch(() => [])) as { courseId: string; status: string; note: string | null; reason: string }[];
  const now = new Date();
  const rows = en.filter((e) => pub.has(e.courseId));
  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Result re-checking</h1>
        <p className="small-note">After a result is published you may ask the Controller of Examinations to have it re-checked, while the window is open.</p>
        {rows.length === 0 ? <div className="card small-note">No published results yet.</div> : rows.map((e) => {
          const p = pub.get(e.courseId)!; const r = mine.find((m) => m.courseId === e.courseId); const open = !!p.recheckUntil && p.recheckUntil > now;
          return (
            <div key={e.courseId} className="card">
              <b>{e.course.code}</b> {e.course.title} <span className="small-note">· published {new Date(p.publishedAt).toDateString()}{p.recheckUntil ? ` · re-checking ${open ? "open until" : "closed on"} ${new Date(p.recheckUntil).toDateString()}` : " · no re-checking window"}</span>
              {r && <div style={{ marginTop: 6 }}>Your request: <b>{r.status}</b>{r.note ? ` — ${r.note}` : ""}</div>}
              {open && (!r || r.status !== "PENDING") && <ActionForm url="/api/student/recheck" fixed={{ courseId: e.courseId }} fields={[{ name: "reason", label: "What should be re-checked, and why", type: "textarea", full: true }]} submit="Ask for re-checking" collapsed openLabel="Ask for re-checking" />}
            </div>
          );
        })}
      </div>
    </StudentShell>
  );
}
