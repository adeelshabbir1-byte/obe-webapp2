import Link from "next/link";
import { prisma } from "../../lib/db";
import { collegeCourses, collegeStudents, obeStudents, obeTranscript, regMap } from "../../lib/uniObe";
import { RegConfirm, ResultsAction } from "./AffForms";

// "Results & OBE" (affiliated colleges): registration numbers, sessional submission and its lock, the university's
// OBE records and the OBE transcript — for both sides. The college sees only its own students.
export default async function ResultsTab({ side, inst, universityId, colleges, sp }: { side: "UNI" | "COLLEGE"; inst: string; universityId: string; colleges: { id: string; name: string }[]; sp: { college?: string; student?: string; q?: string } }) {
  const collegeId = side === "COLLEGE" ? inst : colleges.find((c) => c.id === sp.college)?.id || colleges[0]?.id || "";
  if (!collegeId) return <p className="small-note">No affiliated colleges yet.</p>;
  const base = `/affiliation?tab=RESULTS${side === "UNI" ? `&college=${collegeId}` : ""}`;
  if (sp.student) {
    const own = side === "UNI" || (await prisma.student.findFirst({ where: { id: sp.student, batch: { coordinator: { managedById: inst } } }, select: { id: true } }));
    if (!own) return <p className="small-note">Not one of your students.</p>;
    const t = await obeTranscript(universityId, sp.student);
    return <div>
      <p className="small-note"><Link href={base}>← Results &amp; OBE</Link></p>
      <div className="card"><h2 style={{ marginTop: 0, fontSize: 19 }}>OBE transcript {side === "COLLEGE" && <span className="small-note">(internal copy — the university issues the official one)</span>}</h2>
        <p style={{ fontSize: 13.5, margin: "4px 0" }}><b>{t.student?.name}</b> · roll {t.student?.rollNumber} · registration no. {t.regNo || <i>not confirmed</i>} · {t.student?.batch.degreeProgram} {t.student?.batch.batchName}<br />{t.college} — affiliated with {t.university}</p>
        <a className="btn btn-sm" href={`/api/affiliation/obe-pdf?student=${sp.student}`}>Download PDF</a></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Graduate attributes</h3>
        {t.overall.length ? <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Attribute</th><th>Average</th><th>Status</th><th>Courses</th></tr></thead><tbody>{t.overall.map((g) => <tr key={g.ga}><td>{g.ga}</td><td>{g.pct}%</td><td style={{ color: g.attained ? "#1E6B3A" : "#B3261E" }}>{g.attained ? "Attained" : "Not attained"}</td><td className="small-note">{g.courses.join(", ")}</td></tr>)}</tbody></table> : <p className="small-note">No CLO is mapped to a graduate attribute yet.</p>}</div>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Courses</h3>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Term</th><th>Course</th><th>Total</th><th>CLOs</th></tr></thead><tbody>{t.courses.map((c) => <tr key={`${c.term}${c.courseCode}`}><td>{c.term}</td><td><b>{c.courseCode}</b> {c.courseTitle}</td><td>{c.totalPct == null ? "—" : `${c.totalPct}%`}</td>
          <td>{c.clos.map((x) => <span key={x.code} title={x.ga || ""} style={{ display: "inline-block", margin: "0 4px 4px 0", padding: "1px 8px", borderRadius: 10, fontSize: 12, background: x.status === "CLEARED" ? "#E6F4EA" : x.status === "NOT_CLEARED" ? "#FDECEA" : "#EEE", color: x.status === "CLEARED" ? "#1E6B3A" : x.status === "NOT_CLEARED" ? "#B3261E" : "#555" }}>{x.code} {x.pct == null ? "not assessed" : `${x.pct}% ${x.status === "CLEARED" ? "✓" : "✗"}`}</span>)}</td></tr>)}</tbody></table>
        {!t.courses.length && <p className="small-note">No results yet — they appear when the university enters its marks or the college submits sessionals.</p>}</div>
    </div>;
  }
  const [students, courses] = await Promise.all([collegeStudents(collegeId), collegeCourses(collegeId)]);
  const regs = await regMap(students.map((s) => s.id));
  const pending = students.filter((s) => regs.get(s.id)?.status === "REQUESTED"), confirmed = students.filter((s) => regs.get(s.id)?.status === "CONFIRMED"), none = students.filter((s) => !regs.has(s.id));
  const list = await obeStudents(universityId, collegeId, sp.q);
  return <div>
    {side === "UNI" && <form style={{ marginBottom: 10 }}><input type="hidden" name="tab" value="RESULTS" />College <select name="college" defaultValue={collegeId}>{colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> <button className="btn btn-sm">Open</button></form>}
    <p className="small-note">One exam, two complete OBE records: the college enters its sessional marks and submits them; the university enters its own parts (the final) straight into the college’s course. The college’s OBE data is complete, and the university keeps its own OBE record of every student for OBE transcripts.</p>
    <div className="card"><h3 style={{ marginTop: 0 }}>1 · University registration numbers</h3>
      <p style={{ fontSize: 13 }}>{confirmed.length} confirmed · {pending.length} requested · {none.length} not requested</p>
      {side === "COLLEGE" ? (none.length > 0 && <ResultsAction label={`Request numbers for ${none.length} student(s)`} body={{ action: "regRequest" }} />)
        : (pending.length > 0 ? <RegConfirm collegeId={collegeId} sample={pending.slice(0, 200).map((s) => `${s.rollNumber}, `).join("\n")} /> : <p className="small-note">Nothing waiting.</p>)}
    </div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>2 · Courses and sessional marks</h3>
      <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Course</th><th>Batch</th><th>Sessionals</th><th /></tr></thead><tbody>{courses.map((c) => <tr key={c.id}><td><b>{c.code}</b> {c.title}</td><td>{c.batch?.degreeProgram} {c.batch?.batchName}</td>
        <td>{c.lockedAt ? <span style={{ color: "#1E6B3A" }}>Submitted {new Date(c.lockedAt).toLocaleDateString("en-GB")} · locked</span> : <span className="small-note">not submitted</span>}</td>
        <td>{side === "COLLEGE" ? (!c.lockedAt && <ResultsAction label="Submit to university" body={{ action: "sessSubmit", courseId: c.id }} confirm="Submit the sessional marks? They lock until the university reopens them." />) : <>{c.lockedAt && <ResultsAction label="Reopen" body={{ action: "sessReopen", courseId: c.id }} />} <Link className="btn-link" href={`/affiliates/marks?college=${collegeId}&course=${c.id}`}>Enter university marks</Link></>}</td></tr>)}</tbody></table>
      {!courses.length && <p className="small-note">No offered courses this term.</p>}
      {side === "UNI" && <div style={{ marginTop: 8 }}><ResultsAction label="Refresh this college’s OBE records" body={{ action: "obeRefresh", collegeId }} /></div>}
    </div>
    <div className="card"><h3 style={{ marginTop: 0 }}>3 · OBE transcripts</h3>
      <form style={{ marginBottom: 8 }}><input type="hidden" name="tab" value="RESULTS" />{side === "UNI" && <input type="hidden" name="college" value={collegeId} />}<input name="q" defaultValue={sp.q || ""} placeholder="name, roll or registration no." /> <button className="btn btn-sm">Find</button></form>
      <table className="table" style={{ fontSize: 13 }}><tbody>{list.map((s) => <tr key={s.id}><td><Link href={`${base}&student=${s.id}`}>{s.name}</Link></td><td>{s.rollNumber}</td><td>{s.regNo || <span className="small-note">no reg. no.</span>}</td><td className="small-note">{s.batch.degreeProgram} {s.batch.batchName}</td></tr>)}</tbody></table>
      {!list.length && <p className="small-note">No OBE records yet.</p>}
    </div>
  </div>;
}
