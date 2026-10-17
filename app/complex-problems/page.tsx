import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { bodyOfProgram } from "../../lib/accreditation/bodies";
import { ActionForm } from "../../components/fyp/FypClient";
import { cdb, ATTRS, KNOWLEDGE, parseArr } from "../../lib/complexProblems";

export const dynamic = "force-dynamic";

// Seoul / Washington Accord evidence for a cohort: the knowledge profile its courses cover, and the complex problems
// every student must face (assessments tagged with their attributes), with who has not yet faced one.
export default async function ComplexProblemsPage({ searchParams }: { searchParams: { batch?: string } }) {
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
  return shell(<>
    <p className="small-note">{body === "PEC" ? "PEC / Washington Accord" : "NCEAC / Seoul Accord"} evidence. Panels ask which courses build each knowledge area and where every student solved a {word}. The attribute and area lists follow the accords; check the wording against your council&apos;s current manual.</p>
    <form className="card" style={{ display: "flex", gap: 8 }}><select name="batch" defaultValue={sel.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
      {[["Assessments tagged as complex", String(tags.length)], ["Courses with a complex problem", String(new Set(tags.map((t) => insts.find((i) => i.id === t.instrumentId)?.courseId)).size)], ["Students who faced one", `${students.length - missing.length}/${students.length}`], ["Knowledge areas not covered", uncovered.length ? uncovered.map((u) => u[0]).join(", ") : "none"]].map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div></div>)}
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
              {canEdit && <ActionForm url="/api/complex-problems" fixed={{ action: "tag", instrumentId: i.id }} submit="Save" collapsed openLabel={at.length ? "Edit" : "Tag as complex"} initial={{ ...Object.fromEntries(ATTRS.map(([k]) => [`a_${k}`, at.includes(k)])), note: t?.note || "" }} fields={[...ATTRS.map(([k, n]) => ({ name: `a_${k}`, label: `${k} ${n}`, type: "checkbox" as const })), { name: "note", label: "Problem statement / why it is complex", type: "textarea" as const }]} />}
            </div>); })}
        </div>); })}
    </div>
    {missing.length > 0 && tags.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Students who have not yet faced a {word}</h3><p style={{ fontSize: 13 }}>{missing.slice(0, 200).map((s) => s.rollNumber).join(", ")}</p></div>}
  </>);
}
