import { redirect } from "next/navigation";
import Sources from "../../components/regulations/Sources";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { qdb, QUALITY_HINT, programsFor, canEditProgram } from "../../lib/quality";
import { cohortIndirect } from "../../lib/indirectPlo";

export const dynamic = "force-dynamic";
type Goal = { id: string; code: string; text: string };
type Obj = { id: string; goalId: string; code: string; text: string; ploNumber: number | null; courseCode: string | null; method: string | null; target: number; measureYear: number | null };
type Res = { id: string; objectiveId: string; term: string; attainedPct: number; sample: number | null; closingLoop: string | null; createdAt: Date };

// NBEAC Assurance of Learning: learning goals → measurable objectives (each optionally tied to a PLO and a course),
// a multi-year measurement schedule, results against a target, and how the loop was closed.
export default async function AolPage({ searchParams }: { searchParams: { p?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const programs = await programsFor(user);
  if (!programs.length) redirect("/dashboard");
  const sel = programs.find((p) => p.key === searchParams.p) || programs[0];
  const intro = "Assurance of Learning (NBEAC): set the program's Learning Goals, break each into measurable Learning Objectives, decide in which year and course each is measured, record the result against the target, and write how the loop was closed. An objective tied to a GA shows that GA's current direct attainment as a starting point.";
  const goals = ((await qdb.aolGoal.findMany({ where: { coordinatorId: sel.coordinatorId, degreeProgram: sel.degreeProgram }, orderBy: { code: "asc" } }).catch(() => null)) as Goal[] | null);
  if (goals === null) return <QualityShell user={user} title="Assurance of Learning" intro={intro}><div className="err">{QUALITY_HINT}</div></QualityShell>;
  const objs = (await qdb.aolObjective.findMany({ where: { goalId: { in: goals.map((g) => g.id).concat(["none"]) } }, orderBy: { code: "asc" } })) as Obj[];
  const res = (await qdb.aolResult.findMany({ where: { objectiveId: { in: objs.map((o) => o.id).concat(["none"]) } }, orderBy: { createdAt: "desc" } })) as Res[];
  const latestBatch = await prisma.batch.findFirst({ where: { coordinatorId: sel.coordinatorId, degreeProgram: sel.degreeProgram }, orderBy: { startYear: "asc" }, select: { id: true } });
  const plo = latestBatch ? await cohortIndirect(latestBatch.id).catch(() => null) : null;
  const ploPct = (n: number | null) => (n == null ? null : plo?.rows.find((r) => r.number === n)?.cells.direct?.pct ?? null);
  const edit = canEditProgram(user, sel.coordinatorId);
  const years = Array.from(new Set(objs.map((o) => o.measureYear).filter((y): y is number => !!y))).sort();
  const objFields = [{ name: "code", label: "Code", placeholder: "LO1.1", width: 80 }, { name: "text", label: "Objective (what students will be able to do)", type: "textarea" as const, full: true }, { name: "ploNumber", label: "GA no.", type: "number" as const, width: 70 }, { name: "courseCode", label: "Measured in course", placeholder: "MGT401", width: 110 }, { name: "method", label: "Method / rubric", placeholder: "Case analysis, rubric R2", width: 200 }, { name: "target", label: "Target %", type: "number" as const, width: 70 }, { name: "measureYear", label: "Year measured", type: "number" as const, width: 80 }];
  return (
    <QualityShell user={user} title="Assurance of Learning" intro={intro}>
      <div style={{ margin: "0 0 8px" }}><Sources targets={["page:aol"]} /></div>
      <form className="card" style={{ display: "flex", gap: 8 }}><select name="p" defaultValue={sel.key}>{programs.map((p) => <option key={p.key} value={p.key}>{p.degreeProgram} — {p.lead}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
      {edit && <div className="card"><ActionForm url="/api/quality" fixed={{ action: "aolGoal", program: sel.key }} submit="Add learning goal" collapsed openLabel="Add a learning goal" fields={[{ name: "code", label: "Code", placeholder: `LG${goals.length + 1}`, width: 80 }, { name: "text", label: "Learning goal", type: "textarea", full: true, placeholder: "Our graduates will be effective communicators." }]} /></div>}
      {goals.length === 0 && <div className="card">No learning goals yet.</div>}
      {goals.map((g) => (
        <div key={g.id} className="card">
          <h3 style={{ marginTop: 0 }}>{g.code}: {g.text} {edit && <ActionButton url="/api/quality" body={{ action: "aolDelete", program: sel.key, kind: "goal", id: g.id }} label="Delete" className="act" confirmText="Delete this goal, its objectives and results?" />}</h3>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Objective</th><th>GA</th><th>Course · method</th><th>Year</th><th>Target</th><th>Latest result</th><th>Closing the loop</th><th></th></tr></thead>
            <tbody>{objs.filter((o) => o.goalId === g.id).map((o) => {
              const rs = res.filter((r) => r.objectiveId === o.id); const last = rs[0]; const sug = ploPct(o.ploNumber);
              return (
                <tr key={o.id}>
                  <td style={{ maxWidth: 280 }}><b>{o.code}</b> {o.text}</td>
                  <td>{o.ploNumber ? `GA-${o.ploNumber}` : "—"}{sug != null && <div className="small-note">direct now {sug}%</div>}</td>
                  <td>{o.courseCode || "—"}<div className="small-note">{o.method || ""}</div></td><td>{o.measureYear || "—"}</td><td>{o.target}%</td>
                  <td style={{ color: last ? (last.attainedPct >= o.target ? "#2E7D4F" : "#B3261E") : "var(--slate)", fontWeight: 700 }}>{last ? `${last.attainedPct}% (${last.term}${last.sample ? `, n=${last.sample}` : ""})` : "not measured"}{rs.length > 1 && <div className="small-note">{rs.slice(1, 4).map((r) => `${r.term}: ${r.attainedPct}%`).join(" · ")}</div>}</td>
                  <td style={{ maxWidth: 240 }}>{last?.closingLoop || (last && last.attainedPct < o.target ? <span style={{ color: "#B3261E" }}>needs an action</span> : "—")}</td>
                  <td style={{ minWidth: 160 }}>{edit && <>
                    <ActionForm url="/api/quality" fixed={{ action: "aolResult", program: sel.key, objectiveId: o.id }} submit="Save result" collapsed openLabel="Add result" initial={{ attainedPct: sug ?? "" }} fields={[{ name: "term", label: "Term / year", placeholder: "Fall 2026", width: 100 }, { name: "attainedPct", label: "% meeting the standard", type: "number", width: 80 }, { name: "sample", label: "Students assessed", type: "number", width: 80 }, { name: "closingLoop", label: "Closing the loop (what changes)", type: "textarea", full: true }]} />
                    <ActionForm url="/api/quality" fixed={{ action: "aolObjective", program: sel.key, goalId: g.id, id: o.id }} submit="Save" collapsed openLabel="Edit" initial={{ ...o, ploNumber: o.ploNumber ?? "", measureYear: o.measureYear ?? "", courseCode: o.courseCode ?? "", method: o.method ?? "" }} fields={objFields} />
                    <ActionButton url="/api/quality" body={{ action: "aolDelete", program: sel.key, kind: "objective", id: o.id }} label="Delete" className="act" confirmText="Delete this objective and its results?" /></>}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {edit && <ActionForm url="/api/quality" fixed={{ action: "aolObjective", program: sel.key, goalId: g.id }} submit="Add objective" collapsed openLabel="Add a learning objective" initial={{ target: 70, measureYear: new Date().getFullYear() }} fields={objFields} />}
        </div>
      ))}
      {years.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Measurement schedule</h3>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Objective</th>{years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
            <tbody>{objs.map((o) => <tr key={o.id}><td>{o.code}</td>{years.map((y) => { const done = res.some((r) => r.objectiveId === o.id && r.term.includes(String(y))); return <td key={y} style={{ textAlign: "center" }}>{o.measureYear === y ? (done ? "✓" : "●") : ""}</td>; })}</tr>)}</tbody></table>
          <p className="small-note">● planned · ✓ measured. NBEAC expects every learning goal to be measured at least once in the review cycle.</p>
        </div>
      )}
    </QualityShell>
  );
}
