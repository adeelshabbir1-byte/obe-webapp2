import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { gradeDistribution } from "../../lib/quality";

export const dynamic = "force-dynamic";
const GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];

// Grade distribution across courses and sections, from submitted and approved results, with unusual spreads flagged.
export default async function GradeDistributionPage({ searchParams }: { searchParams: { batch?: string; term?: string; flagged?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch);
  const d = await gradeDistribution({ batch: sel ? { id: sel.id } : where });
  const terms = Array.from(new Set(d.rows.map((r) => r.term)));
  let rows = searchParams.term ? d.rows.filter((r) => r.term === searchParams.term) : d.rows;
  if (searchParams.flagged) rows = rows.filter((r) => r.flags.length);
  const flagged = d.rows.filter((r) => r.flags.length).length;
  return (
    <QualityShell user={user} title="Grade Distribution" intro="The grade spread of every course result that has been submitted or approved. A course is flagged when its share of A grades or fails is well above the usual (more than 1.5 standard deviations), or when its class average is 10 points away from other sections of the same course in the same term. HEC QEC and NCEAC panels look for consistent grading across sections and teachers.">
      <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select name="batch" defaultValue={sel?.id || ""}><option value="">All batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <select name="term" defaultValue={searchParams.term || ""}><option value="">All terms</option>{terms.map((t) => <option key={t}>{t}</option>)}</select>
        <label style={{ fontSize: 13 }}><input type="checkbox" name="flagged" value="1" defaultChecked={!!searchParams.flagged} /> Flagged only</label>
        <button className="btn btn-secondary btn-sm">Show</button>
        <span className="small-note">{d.rows.length} results · usual A share {d.avgA}% · usual fail rate {d.avgF}% · {flagged} flagged</span>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="small-note">No submitted results yet for this choice.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Course</th><th>Teacher</th><th>Term</th><th>Students</th><th>Mean %</th><th>Pass %</th>{GRADES.map((g) => <th key={g}>{g}</th>)}<th>Flags</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.courseId} style={{ background: r.flags.length ? "rgba(179,38,30,0.05)" : undefined }}>
                <td><b>{r.code}</b> <span className="small-note">{r.title} · {r.batch}</span></td><td>{r.teacher}</td><td>{r.term}</td><td>{r.n}</td><td>{r.mean != null ? Math.round(r.mean) : "—"}</td><td>{r.passRate}</td>
                {GRADES.map((g) => <td key={g} style={{ color: r.dist[g] ? undefined : "#bbb" }}>{r.dist[g] || 0}</td>)}
                <td style={{ color: "#B3261E", maxWidth: 240 }}>{r.flags.join("; ")}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </QualityShell>
  );
}
