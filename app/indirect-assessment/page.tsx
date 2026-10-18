import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { cohortIndirect, SOURCES } from "../../lib/indirectPlo";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// Direct + indirect PLO evidence for a cohort, blended by the program's weights, with gaps between what marks say and what people say.
export default async function IndirectPage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const data = sel ? await cohortIndirect(sel.id) : null;
  const canSet = ["CHAIRMAN", "OMC", "PROGRAM_COORDINATOR"].includes(user.role);
  const cell = (c: { pct: number; n: number } | null) => (c ? <span>{c.pct}% <span className="small-note">({c.n})</span></span> : <span className="small-note">—</span>);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Direct &amp; Indirect GA Assessment</h1>
      <p className="small-note">Direct = share of students&apos; course results that met the GA. Indirect = share of ratings of 3 or more out of 5 in course-exit surveys (students fill these under Course Surveys) and in the exit, alumni and employer surveys whose questions are mapped to GAs. The blend uses the program&apos;s weights. A large gap between marks and opinions is flagged for review.</p>
      <form className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
        <button className="btn btn-secondary btn-sm">Show</button>
        <Link href="/coordinator/surveys" className="act">Stakeholder surveys</Link>
      </form>
      {data && (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table><thead><tr><th>GA</th>{SOURCES.map(([k, v]) => <th key={k}>{v}<div className="small-note">weight {data.weights[k]}</div></th>)}<th>Blended</th><th>Marks vs opinion</th></tr></thead>
              <tbody>{data.rows.map((r) => (
                <tr key={r.number}><td><b>GA-{r.number}</b><div className="small-note">{r.title}</div></td>
                  {SOURCES.map(([k]) => <td key={k}>{cell(r.cells[k])}</td>)}
                  <td style={{ fontWeight: 700, color: r.met === null ? undefined : r.met ? "#1F5E36" : "#B3261E" }}>{r.blended ?? "—"}{r.blended !== null ? "%" : ""}</td>
                  <td>{r.gap === null ? "—" : Math.abs(r.gap) >= 20 ? <span style={{ color: "#B3261E" }}>{r.gap > 0 ? `Marks ${r.gap} pts higher — check assessment difficulty` : `Opinion ${-r.gap} pts higher — check if assessments are too hard`}</span> : <span style={{ color: "#1F5E36" }}>consistent</span>}</td></tr>))}</tbody></table>
            {!data.rows.length && <p className="small-note">This cohort has no GAs yet.</p>}
            <p className="small-note">Target: blended ≥ {data.target}%. Numbers in brackets are how many results or ratings each figure is based on.</p>
          </div>
          {canSet && <div className="card"><ActionForm url="/api/indirect-assessment" fixed={{ batchId: data.batch.id }} submit="Save weights" collapsed openLabel="Change weights and target for this program" initial={{ ...data.weights, target: data.target }}
            fields={[...SOURCES.map(([k, v]) => ({ name: k, label: v, type: "number" as const, width: 90 })), { name: "target", label: "Target %", type: "number" as const, width: 80 }]} /></div>}
        </>
      )}
    </Shell>
  );
}
