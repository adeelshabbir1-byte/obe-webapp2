import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/db";
import { requireDean } from "../../../../lib/deanGuard";
import { writeAuditLog } from "../../../../lib/audit";
import { loadCurriculumForDownload } from "../../../../lib/masterCurriculumDownload";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import { DeanCurriculumDecisionPanel } from "../../../../components/DeanDecisions";

export const dynamic = "force-dynamic";

// The Dean reads the whole curriculum here — PLOs, every course by semester with its CLOs and lecture topics — and
// only from this page can approve it or return it for changes. Opening it is recorded, and the decision API checks that.
export default async function DeanCurriculumReviewPage({ params }: { params: { curriculumId: string } }) {
  const user = await requireDean();
  const c = await loadCurriculumForDownload(user, params.curriculumId);
  // Same list the Dean signs off on: the institute's own curricula.
  if (!c || c.chairmanId !== (user.managedById || "none")) notFound();

  const [decision, opened] = await Promise.all([
    user.facultyId ? prisma.curriculumDeanApproval.findUnique({ where: { facultyId_curriculumId: { facultyId: user.facultyId, curriculumId: c.id } } }) : null,
    prisma.auditLog.findFirst({ where: { actorUserId: user.id, action: "DEAN_CURRICULUM_OPENED", entityId: c.id }, select: { id: true } }),
  ]);
  if (!opened) await writeAuditLog({ actorUserId: user.id, action: "DEAN_CURRICULUM_OPENED", entityType: "MasterCurriculum", entityId: c.id });

  const semesters = new Map<number | null, typeof c.courses>();
  for (const k of c.courses) semesters.set(k.semesterNumber, [...(semesters.get(k.semesterNumber) || []), k]);
  const order = Array.from(semesters.keys()).sort((a, b) => (a ?? 99) - (b ?? 99));
  const credits = c.courses.reduce((n, k) => n + k.creditHours, 0);
  const cloCount = c.courses.reduce((n, k) => n + k.seedClos.length, 0);
  const withPlan = c.courses.filter((k) => k.seedTopics.length > 0).length;
  const plosOf = (k: (typeof c.courses)[number]) => Array.from(new Set(k.seedClos.map((l) => l.mappedPlo?.number).filter((n): n is number => n != null))).sort((a, b) => a - b);
  const tile = (label: string, value: string | number) => (
    <div className="stat stat-neutral" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--slate)" }}>{label}</div>
    </div>
  );

  return (
    <Shell roleLabel="Dean" userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>{c.title}</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0 }}>
            {c.authority} · version {c.version}{c.degreeProgram ? ` · ${c.degreeProgram}` : ""}{c.sourceReference ? ` · ${c.sourceReference}` : ""}
            {c.publicationDate ? ` · published ${c.publicationDate.toISOString().slice(0, 10)}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
          <a className="btn btn-secondary btn-sm" href={`/api/master-curriculum/${c.id}/download?format=xlsx`}>Download Excel</a>
          <a className="btn btn-secondary btn-sm" href={`/api/master-curriculum/${c.id}/download?format=docx`}>Download Word</a>
          <Link className="btn btn-secondary btn-sm" href="/dean/curricula">← Back to curricula</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        {tile("Courses", c.courses.length)}
        {tile("Credit hours", credits)}
        {tile("Semesters", order.filter((s) => s !== null).length)}
        {tile("GAs", c.plos.length)}
        {tile("CLOs", cloCount)}
        {tile("Courses with a lecture plan", `${withPlan} / ${c.courses.length}`)}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Graduate Attributes</h3>
        {c.plos.length === 0 ? <p className="small-note">No GAs in this curriculum.</p> : (
          <table>
            <thead><tr><th style={{ width: 70 }}>GA</th><th>Title</th><th>Description</th></tr></thead>
            <tbody>{c.plos.map((p) => <tr key={p.id}><td><b>GA-{p.number}</b></td><td>{p.title}</td><td style={{ fontSize: 12.5 }}>{p.description}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      {order.map((sem) => {
        const list = semesters.get(sem) || [];
        return (
          <div className="card" key={String(sem)}>
            <h3 style={{ marginTop: 0 }}>{sem ? `Semester ${sem}` : "Electives / not placed in a semester"} <span className="small-note">({list.reduce((n, k) => n + k.creditHours, 0)} credit hours)</span></h3>
            {list.map((k) => (
              <details key={k.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                <summary style={{ cursor: "pointer", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <b>{k.code}</b><span>{k.title}</span>
                  <span className="small-note">{k.creditHours} CH · {k.category}{k.domain ? ` · ${k.domain}` : ""}{k.prerequisiteCourse ? ` · prerequisite ${k.prerequisiteCourse.code}` : ""}</span>
                  <span className="small-note">{k.seedClos.length} CLOs{plosOf(k).length ? ` → GA ${plosOf(k).join(", ")}` : ""} · {k.seedTopics.length} lecture topics</span>
                </summary>
                <div style={{ padding: "8px 0 4px 14px", fontSize: 12.5 }}>
                  {k.catalogDescription && <p style={{ marginTop: 0 }}>{k.catalogDescription}</p>}
                  {k.seedClos.length > 0 && (
                    <table style={{ marginBottom: 8 }}>
                      <thead><tr><th style={{ width: 60 }}>CLO</th><th>Statement</th><th style={{ width: 70 }}>Level</th><th style={{ width: 70 }}>GA</th></tr></thead>
                      <tbody>{k.seedClos.map((l, i) => <tr key={l.id}><td>CLO-{i + 1}</td><td>{l.statement}</td><td>{l.bloomLevel}</td><td>{l.mappedPlo ? `GA-${l.mappedPlo.number}` : "—"}</td></tr>)}</tbody>
                    </table>
                  )}
                  {k.seedTopics.length > 0 && (
                    <ol style={{ margin: 0, paddingLeft: 20, columns: 2, columnGap: 24 }}>
                      {k.seedTopics.map((t) => <li key={t.id}>{t.topic}{t.subtopic ? ` — ${t.subtopic}` : ""}</li>)}
                    </ol>
                  )}
                  {k.textbook && <p style={{ marginBottom: 0 }}><b>Textbook:</b> {k.textbook}</p>}
                </div>
              </details>
            ))}
          </div>
        );
      })}

      <DeanCurriculumDecisionPanel
        curriculumId={c.id}
        status={decision?.status || null}
        note={decision?.note || null}
        decidedAt={decision?.decidedAt ? decision.decidedAt.toISOString().slice(0, 10) : null}
      />
    </Shell>
  );
}
