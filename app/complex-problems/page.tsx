import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { bodyOfProgram } from "../../lib/accreditation/bodies";
import { ActionForm } from "../../components/fyp/FypClient";
import { cdb, ATTRS, EA_ATTRS, KNOWLEDGE, parseArr } from "../../lib/complexProblems";
import { complexCoverage } from "../../lib/complexCoverage";
import HowCalculated from "../../components/HowCalculated";
import CoverageMatrix from "../../components/ComplexCoverageMatrix";

export const dynamic = "force-dynamic";

// Seoul / Washington Accord evidence for a cohort: the knowledge profile its courses cover, and the complex problems
// every student must face (assessments tagged with their attributes), with who has not yet faced one.
export default async function ComplexProblemsPage({ searchParams }: { searchParams: { batch?: string; view?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Complex Problems &amp; Knowledge Profile</h1>{c}</Shell>;
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  if (!sel) return shell(<p className="small-note">No batches.</p>);
  const cid = await chairmanIdFor(user);
  const body = (await bodyOfProgram(cid, sel.degreeProgram)).body;
  const kset = KNOWLEDGE[body === "PEC" ? "PEC" : "NCEAC"];
  const word = body === "PEC" ? "complex engineering problem" : "complex computing problem";
  const courses = await prisma.course.findMany({ where: { batchId: sel.id }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" } });
  const codes = Array.from(new Map(courses.map((c) => [c.code, c])).values());
  const know = ((await cdb.courseKnowledge.findMany({ where: { chairmanId: cid, courseCode: { in: codes.map((c) => c.code) } } }).catch(() => null)) as { courseCode: string; areasJson: string }[] | null);
  if (know === null) return shell(<div className="err">Run prisma/migration_teaching_extras.sql first.</div>);
  const kOf = new Map(know.map((k) => [k.courseCode, parseArr(k.areasJson)]));
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, courseId: true, label: true, type: true }, orderBy: [{ type: "asc" }, { label: "asc" }] });
  const tags = (await cdb.complexTag.findMany({ where: { courseId: { in: courses.map((c) => c.id) } } })) as { instrumentId: string; attrsJson: string; note: string | null }[];
  const tOf = new Map(tags.map((t) => [t.instrumentId, t]));
  const students = await prisma.student.findMany({ where: { batchId: sel.id }, select: { id: true, rollNumber: true, name: true } });
  const faced = new Set((await prisma.studentMark.findMany({ where: { instrumentId: { in: tags.map((t) => t.instrumentId) } }, select: { studentId: true } })).map((m) => m.studentId));
  const missing = students.filter((s) => !faced.has(s.id));
  const uncovered = kset.filter(([k]) => !codes.some((c) => kOf.get(c.code)?.includes(k)));
  const canEdit = ["CHAIRMAN", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "OMC", "DEPARTMENT_COORDINATOR"].includes(user.role);
  const view = searchParams.view === "matrix" ? "matrix" : "tags";
  const cov = await complexCoverage(cid, sel.id);
  const top = <>
    <p className="small-note">{body === "PEC" ? "PEC / Washington Accord" : "NCEAC / Seoul Accord"} evidence. Panels ask which courses build each knowledge area and where every student solved a {word}. The attribute and area lists follow the accords; check the wording against your council&apos;s current manual.</p>
    <HowCalculated shows={`Where the program's students meet ${word}s, and which knowledge areas its courses build.`}>
      <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
        <li>A {word} is an assessment, lab task or final year project tagged with <b>P1 depth of knowledge</b> plus some of P2–P7{body === "PEC" ? " (and the complex activities EA1–EA5)" : ""}.</li>
        <li>A course covers a knowledge area when it is ticked for the course, or for one of its tagged assessments, labs or projects.</li>
        <li>Attainment on a complex assessment = the share of its students scoring at least half its marks; the program figure is the average over its complex assessments.</li>
        <li>A student has faced a {word} when they have marks in a tagged assessment, or are a member of a tagged final year project.</li>
      </ul>
    </HowCalculated>
    <form className="card" style={{ display: "flex", gap: 8 }}><input type="hidden" name="view" value={view} /><select name="batch" defaultValue={sel.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
    <div role="tablist" className="tabs no-print"><a role="tab" className="tab" aria-selected={view === "tags"} href={`?batch=${sel.id}`}>Tagging</a><a role="tab" className="tab" aria-selected={view === "matrix"} href={`?batch=${sel.id}&view=matrix`}>Coverage matrix</a></div>
  </>;
  if (view === "matrix" && cov) return shell(<>{top}<CoverageMatrix cov={cov} /></>);
  const kFields = kset.map(([k, n]) => ({ name: `k_${k}`, label: `${k} ${n}`, type: "checkbox" as const }));
  const aFields = [...ATTRS.map(([k, n]) => ({ name: `a_${k}`, label: `${k} ${n}`, type: "checkbox" as const })), ...(body === "PEC" ? EA_ATTRS.map(([k, n]) => ({ name: `a_${k}`, label: `${k} ${n}`, type: "checkbox" as const })) : [])];
  const initOf = (at: string[], note: string | null | undefined) => ({ ...Object.fromEntries([...ATTRS, ...EA_ATTRS].map(([k]) => [`a_${k}`, at.includes(k)])), ...Object.fromEntries(kset.map(([k]) => [`k_${k}`, at.includes(k)])), note: note || "" });
  return shell(<>
    {top}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
      {[["Assessments tagged as complex", String(tags.filter((t) => parseArr(t.attrsJson).includes("P1")).length)], ...(body === "PEC" ? [["Complex activities (EA1–EA5)", String(tags.filter((t) => parseArr(t.attrsJson).some((k) => k.startsWith("EA"))).length)], ["Open-ended labs", `${(cov?.oel || []).filter((o) => o.openEnded).length} in ${new Set((cov?.oel || []).filter((o) => o.openEnded).map((o) => o.lab)).size} lab course(s)`]] : []), ["Courses with a complex problem", String(new Set(tags.filter((t) => parseArr(t.attrsJson).includes("P1")).map((t) => insts.find((i) => i.id === t.instrumentId)?.courseId)).size)], ["Students who faced one", `${students.length - missing.length}/${students.length}`], ["Knowledge areas not covered", uncovered.length ? uncovered.map((u) => u[0]).join(", ") : "none"]].map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div></div>)}
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Knowledge profile</h3>
      <table><thead><tr><th>Course</th>{kset.map(([k, n]) => <th key={k} title={n}>{k}</th>)}{canEdit && <th />}</tr></thead>
        <tbody>{codes.map((c) => { const a = kOf.get(c.code) || []; return <tr key={c.code}><td>{c.code} <span className="small-note">{c.title}</span></td>{kset.map(([k]) => <td key={k} style={{ textAlign: "center" }}>{a.includes(k) ? "●" : ""}</td>)}
          {canEdit && <td><ActionForm url="/api/complex-problems" fixed={{ action: "knowledge", courseCode: c.code }} submit="Save" collapsed openLabel="Edit" initial={Object.fromEntries(kset.map(([k]) => [`k_${k}`, a.includes(k)]))} fields={kset.map(([k, n]) => ({ name: `k_${k}`, label: `${k} ${n}`, type: "checkbox" as const }))} /></td>}</tr>; })}
          <tr><td><b>Courses covering</b></td>{kset.map(([k]) => { const n = codes.filter((c) => kOf.get(c.code)?.includes(k)).length; return <td key={k} style={{ textAlign: "center", color: n ? undefined : "#B3261E", fontWeight: 700 }}>{n}</td>; })}{canEdit && <td />}</tr></tbody></table>
      <p className="small-note">{kset.map(([k, n]) => `${k} ${n}`).join(" · ")}</p>
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Complex problems by course</h3>
      <p className="small-note">Tag the assignment, project, lab or exam question that is a {word}. It must require depth of knowledge (P1) plus some of the other attributes. The Program Lead (or OMC / Chairman) tags them here.</p>
      {courses.map((c) => { const its = insts.filter((i) => i.courseId === c.id); if (!its.length) return null; return (
        <div key={c.id} style={{ borderTop: "1px solid #E3E9F0", padding: "6px 0" }}><b>{c.code}</b> <span className="small-note">{c.title}</span>
          {its.map((i) => { const t = tOf.get(i.id); const at = parseArr(t?.attrsJson); return (
            <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13, marginLeft: 12 }}>
              <span style={{ minWidth: 160 }}>{i.label} <span className="small-note">{i.type}</span></span>
              <span style={{ color: at.length ? "#1F5E36" : "#7A8796" }}>{at.length ? `Complex: ${at.join(", ")}` : "—"}</span>{t?.note && <span className="small-note">{t.note}</span>}
              {canEdit && <ActionForm url="/api/complex-problems" fixed={{ action: "tag", instrumentId: i.id }} submit="Save" collapsed openLabel={at.length ? "Edit" : "Tag as complex"} initial={initOf(at, t?.note)} fields={[...aFields, ...kFields, { name: "note", label: "Problem statement / why it is complex", type: "textarea" as const }]} />}
            </div>); })}
        </div>); })}
    </div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Open-ended labs</h3><p className="small-note">{body === "PEC" ? "PEC" : "NCEAC (3.i)"} expects open-ended labs, where students design their own solution to a loosely defined problem. The Lab Engineer or the course instructor marks a lab task as open-ended on the lab page; tag it here with the attributes it brings out.</p>
      {(cov?.oel || []).length === 0 ? <p className="small-note">This batch has no lab tasks yet.</p> : <table style={{ fontSize: 13 }}><tbody>{Array.from(new Set((cov?.oel || []).map((o) => o.courseId))).map((cidL) => { const xs = (cov?.oel || []).filter((o) => o.courseId === cidL); const open = xs.filter((o) => o.openEnded || o.attrs.length); return <tr key={cidL}><td style={{ verticalAlign: "top" }}><b>{xs[0].lab}</b></td><td>{open.length ? open.map((o) => <div key={o.labNumber} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><span>Lab {o.labNumber}: {o.title}{o.openEnded ? " (open-ended)" : ""}</span><span style={{ color: o.attrs.length ? "#1F5E36" : "#7A8796" }}>{o.attrs.length || o.knowledge.length ? [...o.attrs, ...o.knowledge].join(", ") : "not tagged"}</span>{canEdit && <ActionForm url="/api/complex-problems" fixed={{ action: "target", kind: "LAB", refId: `${o.courseId}:${o.labNumber}` }} submit="Save" collapsed openLabel={o.attrs.length ? "Edit" : "Tag"} initial={initOf([...o.attrs, ...o.knowledge], null)} fields={[...aFields, ...kFields]} />}</div>) : <span style={{ color: "#B3261E" }}>no open-ended lab</span>}</td></tr>; })}</tbody></table>}</div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Final year projects</h3><p className="small-note">The final year {body === "PEC" ? "design " : ""}project should be a {word}. Tag each group&apos;s project with the attributes and knowledge areas it covers.</p>
      {(cov?.fyp || []).length === 0 ? <p className="small-note">No final year project group has students of this batch yet.</p> : <table style={{ fontSize: 13 }}><tbody>{(cov?.fyp || []).map((g) => <tr key={g.id}><td><b>{g.name}</b> <span className="small-note">{g.members} student(s)</span></td><td style={{ color: g.attrs.length ? "#1F5E36" : "#B3261E" }}>{g.attrs.length || g.knowledge.length ? [...g.attrs, ...g.knowledge].join(", ") : "not tagged"}{g.note && <div className="small-note" style={{ margin: 0 }}>{g.note}</div>}</td><td>{canEdit && <ActionForm url="/api/complex-problems" fixed={{ action: "target", kind: "FYP", refId: g.id }} submit="Save" collapsed openLabel={g.attrs.length ? "Edit" : "Tag"} initial={initOf([...g.attrs, ...g.knowledge], g.note)} fields={[...aFields, ...kFields, { name: "note", label: "Why it is complex", type: "textarea" as const }]} />}</td></tr>)}</tbody></table>}</div>
    {missing.length > 0 && tags.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Students who have not yet faced a {word}</h3><p style={{ fontSize: 13 }}>{missing.slice(0, 200).map((s) => s.rollNumber).join(", ")}</p></div>}
  </>);
}
