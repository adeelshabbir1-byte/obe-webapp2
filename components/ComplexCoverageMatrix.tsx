import type { Coverage } from "../lib/complexCoverage";

const dot = (on: boolean) => <span style={{ color: on ? "#1E6B3A" : "#C9B9BC", fontWeight: 800 }}>{on ? "●" : "·"}</span>;
const pct = (x: number | null) => (x === null ? "—" : `${x}%`);
const tone = (x: number | null) => (x === null ? undefined : x >= 70 ? "#1E6B3A" : x >= 50 ? "#9A3412" : "#B3261E");

/** Which attributes and knowledge areas each course, assessment, lab and project covers; the gaps; student attainment. */
export default function CoverageMatrix({ cov }: { cov: Coverage }) {
  const cols = [...cov.attrs.map(([k, n]) => ({ k, n, group: "attr" })), ...cov.kset.map(([k, n]) => ({ k, n, group: "know" }))];
  const stat = (label: string, value: string, colour?: string) => <div className="card" style={{ margin: 0 }}><div className="small-note">{label}</div><div style={{ fontSize: 20, fontWeight: 800, color: colour }}>{value}</div></div>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 12 }}>
        {stat("Courses with a complex problem", `${cov.coursesWithComplex}/${cov.courses.length}`)}
        {stat("Complex assessments", String(cov.complexAssessments))}
        {stat("Students who faced one", `${cov.students.faced}/${cov.students.total}`, cov.students.faced === cov.students.total && cov.students.total ? "#1E6B3A" : "#B3261E")}
        {stat("Attainment on complex assessments", pct(cov.attainment), tone(cov.attainment))}
        {stat("Attributes never covered", cov.gaps.attrs.length ? cov.gaps.attrs.join(", ") : "none", cov.gaps.attrs.length ? "#B3261E" : "#1E6B3A")}
        {stat("Knowledge areas never covered", cov.gaps.knowledge.length ? cov.gaps.knowledge.join(", ") : "none", cov.gaps.knowledge.length ? "#B3261E" : "#1E6B3A")}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Coverage matrix — {cov.batch.degreeProgram}, {cov.batch.batchName}</h3>
        <table className="table" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Course / assessment</th>{cols.map((c) => <th key={c.k} title={c.n} style={{ textAlign: "center", background: c.group === "attr" ? "#F7EEF0" : "#EEF3F8" }}>{c.k}</th>)}<th>Students</th><th>Average</th><th>Scored ≥ half</th></tr></thead>
          <tbody>
            {cov.courses.map((c) => {
              const attrsOf = new Set(c.items.flatMap((i) => i.attrs));
              return [
                <tr key={c.id} style={{ background: "#FBF8F8" }}><td><b>{c.code}</b> <span className="small-note">{c.title}</span></td>{cols.map((col) => <td key={col.k} style={{ textAlign: "center" }}>{dot(col.group === "attr" ? attrsOf.has(col.k) : c.knowledge.includes(col.k))}</td>)}<td colSpan={3} className="small-note">{c.items.length ? `${c.items.length} tagged` : "nothing tagged"}</td></tr>,
                ...c.items.map((i) => (
                  <tr key={`${c.id}-${i.ref}`}><td style={{ paddingLeft: 22 }}>{i.label}{i.kind === "LAB" ? " — lab" : ""}</td>{cols.map((col) => <td key={col.k} style={{ textAlign: "center" }}>{dot(col.group === "attr" ? i.attrs.includes(col.k) : i.knowledge.includes(col.k))}</td>)}<td>{i.kind === "ASSESSMENT" ? i.students : "—"}</td><td style={{ color: tone(i.avgPct), fontWeight: 700 }}>{pct(i.avgPct)}</td><td style={{ color: tone(i.passPct), fontWeight: 700 }}>{pct(i.passPct)}</td></tr>
                )),
              ];
            })}
            {cov.fyp.map((g) => <tr key={g.id}><td><b>Final year project</b> {g.name} <span className="small-note">{g.members} student(s)</span></td>{cols.map((col) => <td key={col.k} style={{ textAlign: "center" }}>{dot(col.group === "attr" ? g.attrs.includes(col.k) : g.knowledge.includes(col.k))}</td>)}<td colSpan={3} /></tr>)}
            <tr><td><b>Times covered</b></td>{cols.map((col) => { const n = col.group === "attr" ? cov.attrCount[col.k] : cov.knowCount[col.k]; return <td key={col.k} style={{ textAlign: "center", fontWeight: 800, color: n ? "#1E6B3A" : "#B3261E" }}>{n}</td>; })}<td colSpan={3} /></tr>
          </tbody>
        </table>
        <p className="small-note">{cols.map((c) => `${c.k} ${c.n}`).join(" · ")}</p>
      </div>
      {(cov.students.missing.length > 0 || cov.students.struggling.length > 0) && (
        <div className="card">
          {cov.students.missing.length > 0 && <><h3 style={{ marginTop: 0 }}>Students who have not yet faced a {cov.word} ({cov.students.missing.length})</h3><p style={{ fontSize: 13 }}>{cov.students.missing.slice(0, 200).map((s) => s.roll).join(", ")}</p></>}
          {cov.students.struggling.length > 0 && <><h3>Below half the marks on every complex assessment ({cov.students.struggling.length})</h3><p style={{ fontSize: 13 }}>{cov.students.struggling.slice(0, 200).map((s) => `${s.roll} ${s.name}`).join(", ")}</p></>}
        </div>
      )}
    </>
  );
}
