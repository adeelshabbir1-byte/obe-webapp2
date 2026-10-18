import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import PortfolioForm from "../../../components/PortfolioForm";
import DeleteLink from "../../../components/DeleteLink";
import { pdb, KINDS } from "../../../lib/portfolio";
import { studentPloProfile } from "../../../lib/studentPlo";

export const dynamic = "force-dynamic";
type Item = { id: string; title: string; kind: string; description: string | null; link: string | null; fileName: string | null; fileUrl: string | null; ploCodes: string | null; verifiedAt: Date | null };

// The student's e-portfolio: graduate-attribute (PLO) profile, own entries, and course work chosen as evidence.
export default async function StudentPortfolio() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const [plos, items, samples] = await Promise.all([
    studentPloProfile(st.id),
    pdb.studentPortfolioItem.findMany({ where: { studentId: st.id }, orderBy: { createdAt: "desc" } }).catch(() => null) as Promise<Item[] | null>,
    pdb.studentWorkSample.findMany({ where: { studentId: st.id } }).catch(() => []) as Promise<{ id: string; courseId: string; level: string; fileName: string; fileUrl: string }[]>,
  ]);
  const courses = new Map((await prisma.course.findMany({ where: { id: { in: samples.map((s) => s.courseId) } }, select: { id: true, code: true, title: true } })).map((c) => [c.id, c]));
  const kindName = new Map(KINDS);
  return (
    <StudentShell studentName={st.name}>
      <h1 style={{ fontSize: 22 }}>My Portfolio</h1>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Graduate attributes (GAs)</h3>
        {plos.length ? plos.map((p) => (
          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "4px 0" }}>
            <span style={{ width: 60 }}>{p.label}</span>
            <div style={{ flex: 1, background: "#E3E9F0", borderRadius: 4, height: 12 }}><div style={{ width: `${Math.min(100, p.pct)}%`, background: p.pct >= 50 ? "#3C8A3F" : "#B3261E", height: 12, borderRadius: 4 }} /></div>
            <b style={{ width: 48, textAlign: "right" }}>{p.pct}%</b><span className="small-note">{p.courses} courses</span>
          </div>)) : <p className="small-note">Appears once your first results are finalised.</p>}
      </div>
      {items === null ? <div className="err">Portfolio is not set up yet.</div> : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ margin: 0 }}>My entries</h3></div>
          <PortfolioForm kinds={KINDS} plos={plos.map((p) => p.label)} />
          {items.map((i) => (
            <div key={i.id} style={{ borderTop: "1px solid #E3E9F0", padding: "8px 0", fontSize: 13.5 }}>
              <b>{i.title}</b> <span className="small-note">{kindName.get(i.kind) || i.kind}{i.ploCodes ? ` · ${i.ploCodes}` : ""}</span> {i.verifiedAt ? <span style={{ color: "#1F5E36", fontWeight: 700 }}>✓ Verified</span> : <DeleteLink url={`/api/student/portfolio?id=${i.id}`} />}
              {i.description && <div>{i.description}</div>}
              <div>{i.link && <a href={i.link} target="_blank" rel="noopener noreferrer">{i.link}</a>} {i.fileUrl && <a href={i.fileUrl} target="_blank" rel="noopener noreferrer">{i.fileName || "file"}</a>}</div>
            </div>))}
          {!items.length && <p className="small-note">Add projects, certificates, internships and competitions. Staff verify them, and they count as evidence for your graduate attributes.</p>}
        </div>
      )}
      {samples.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>My work kept as course evidence</h3>{samples.map((s) => <div key={s.id} style={{ fontSize: 13 }}>{courses.get(s.courseId)?.code} {courses.get(s.courseId)?.title} — <a href={s.fileUrl} target="_blank" rel="noopener noreferrer">{s.fileName}</a></div>)}</div>}
    </StudentShell>
  );
}
