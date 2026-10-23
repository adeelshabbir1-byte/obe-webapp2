import Link from "next/link";
import { computeStudentTranscriptReport, type TranscriptCourseRow } from "../lib/studentTranscriptReport";
import { ploTranscript, degreeAudit } from "../lib/transcriptPlus";
import { studentNow } from "../lib/studentNow";
import { academicRules, standingWith } from "../lib/academicRules";
import { prisma } from "../lib/db";
import ThisSemester from "./ThisSemester";
import DegreeSchemeBoard from "./DegreeSchemeBoard";
import PrintButton from "./PrintButton";
import HowCalculated from "./HowCalculated";
import { StatusBadge } from "./Meaning";

// One student's record in tabs — the same for the student, the advisor and the program staff.
export const TABS: [string, string][] = [["now", "This semester"], ["grades", "Grades transcript"], ["plo", "PLO transcript"], ["audit", "Degree audit"], ["plan", "Semester plan"]];
const GOOD = "#1E7B45", BLUE = "#1565C0", WARN = "#B26A00", BAD = "#C62828";
const TYPE_COLOR: Record<string, string> = { Core: "#1565C0", Elective: "#6A1B9A", "General Education": "#00796B", IDS: "#5D4037", Lab: "#283593", "Capstone Project": "#AD1457", "Field Experience": "#EF6C00" };
const gradeColor = (g: string) => (/^A/.test(g) ? GOOD : /^B/.test(g) ? BLUE : /^C/.test(g) ? WARN : /^(D|F|W)/.test(g) ? BAD : "#555");
const chip = (t: string, bg: string) => <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, background: bg, color: "#fff", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{t}</span>;
const termKey = (r: { termName: string; termYear: number }) => r.termYear * 3 + (/spring/i.test(r.termName) ? 0 : /summer/i.test(r.termName) ? 1 : 2);

export default async function TranscriptView({ studentId, tab, base, staff = false }: { studentId: string; tab: string; base: string; staff?: boolean }) {
  const t = TABS.some(([k]) => k === tab) ? tab : "now";
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true, rollNumber: true, currentSemesterNumber: true, batch: { select: { degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } } } });
  if (!st) return null;
  const rules = await academicRules(st.batch.coordinator.managedById);
  const report = await computeStudentTranscriptReport(studentId);
  const standing = standingWith(report.cgpa, rules);
  const sep = base.includes("?") ? "&" : "?";

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center", borderTop: "4px solid #7A2E3B" }}>
        <div><b style={{ fontSize: 16 }}>{st.name}</b> <span className="small-note">{st.rollNumber} · {st.batch.degreeProgram} — {st.batch.batchName} · semester {st.currentSemesterNumber}</span></div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span><span className="small-note">CGPA </span><b style={{ fontSize: 20, color: standing === "PROBATION" ? BAD : standing === "WARNING" ? WARN : GOOD }}>{report.cgpa !== null ? report.cgpa.toFixed(2) : "—"}</b></span>
          <span><span className="small-note">Credits </span><b style={{ fontSize: 20 }}>{report.totalCredits}</b></span>
          {chip(standing === "PROBATION" ? "Probation" : standing === "WARNING" ? "Academic warning" : "Good standing", standing === "PROBATION" ? BAD : standing === "WARNING" ? WARN : GOOD)}
          <span className="no-print"><PrintButton /></span>
        </div>
      </div>
      <div role="tablist" className="tabs no-print" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => <Link key={k} role="tab" className="tab" aria-selected={t === k} href={`${base}${sep}tab=${k}`} scroll={false}>{l}</Link>)}
      </div>
      {t === "now" && <HowCalculated shows="The courses the student is registered in this semester, with attendance and marks so far.">Attendance is the share of lectures held so far that the student attended (late counts as present unless the OMC's attendance policy says otherwise); marks so far are the weighted marks of the assessments already marked, out of what has been assessed. Nothing here is a final grade.</HowCalculated>}
      {t === "grades" && <HowCalculated shows="Every course attempted, by term, with grade, grade points and GPA.">GPA is the credit-hour weighted average of the grade points of a term. CGPA uses every term, but when a course was taken more than once only the <b>best attempt</b> counts. Non-credit deficiency courses and W (withdrawn) carry no grade points. Standing follows the Controller of Examinations&apos; limits shown below the tabs.</HowCalculated>}
      {t === "plo" && <HowCalculated shows="For every GA (PLO), each course that assessed it, the student's % in it, and whether the GA is attained overall.">In each course, the student&apos;s GA % is the marks they got on the questions mapped (through CLOs) to the GA, out of what those questions were worth. Overall, a GA is <b>attained</b> when the credit-hour weighted average of those course %s is at or above the GA pass mark (50% unless the OMC or the program&apos;s council standard sets another).</HowCalculated>}
      {t === "audit" && <HowCalculated shows="The program's requirements by course type against what the student has passed, is taking, failed or still has to take.">Graduation checks: total credits, the minimum CGPA, every GA attained and every deficiency course passed. Record checks flag duplicate entries, a grade that disagrees with its grade points, credit hours that differ from the curriculum, and courses outside the scheme of studies.</HowCalculated>}
      {t === "now" && <NowTab studentId={studentId} />}
      {t === "grades" && <GradesTab rows={report.courseRows} remaining={report.remaining} />}
      {t === "plo" && <PloTab studentId={studentId} />}
      {t === "audit" && <AuditTab studentId={studentId} />}
      {t === "plan" && <DegreeSchemeBoard studentId={staff ? studentId : undefined} />}
      {standing !== "GOOD_STANDING" && <p className="small-note">Standing uses the limits set by the Controller of Examinations: warning below {rules.warningCgpa.toFixed(2)}, probation below {rules.probationCgpa.toFixed(2)}.</p>}
    </div>
  );
}

async function NowTab({ studentId }: { studentId: string }) {
  const rows = await studentNow(studentId).catch(() => []);
  return rows.length ? <ThisSemester rows={rows} /> : <div className="card small-note">Not registered in any course this semester yet.</div>;
}

function GradesTab({ rows, remaining }: { rows: TranscriptCourseRow[]; remaining: { code: string; title: string; creditHours: number; reason: string; lastGrade: string; lastTermName: string; lastTermYear: number }[] }) {
  const terms = Array.from(new Set(rows.map((r) => `${r.termName}|${r.termYear}`))).map((k) => { const [termName, y] = k.split("|"); return { termName, termYear: Number(y) }; }).sort((a, b) => termKey(a) - termKey(b));
  const best = new Map<string, { p: number; ch: number }>();
  return (
    <div>
      <div className="card small-note" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        Course types: {Object.entries(TYPE_COLOR).map(([k, c]) => <span key={k}>{chip(k, c)}</span>)}
        <span style={{ marginLeft: 8 }}>Grades: {chip("A", GOOD)} {chip("B", BLUE)} {chip("C", WARN)} {chip("D / F", BAD)}</span>
      </div>
      {terms.length === 0 && <div className="card small-note">No courses on record yet.</div>}
      {terms.map((tm) => {
        const xs = rows.filter((r) => r.termName === tm.termName && r.termYear === tm.termYear);
        const cr = xs.filter((r) => r.gpaPoints !== null).reduce((a, r) => a + r.creditHours, 0);
        const gpa = cr ? xs.filter((r) => r.gpaPoints !== null).reduce((a, r) => a + r.gpaPoints! * r.creditHours, 0) / cr : null;
        for (const r of xs) if (r.gpaPoints !== null) { const k = r.code.toUpperCase(), b = best.get(k); if (!b || r.gpaPoints > b.p) best.set(k, { p: r.gpaPoints, ch: r.creditHours }); }
        let P = 0, C = 0; best.forEach((b) => { P += b.p * b.ch; C += b.ch; });
        const current = xs.some((r) => r.isCurrent);
        return (
          <div key={`${tm.termName}${tm.termYear}`} className="card" style={{ padding: 0, overflow: "hidden", borderLeft: `5px solid ${current ? "#F9A825" : "#7A2E3B"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "8px 14px", background: current ? "#FFF3C4" : "#F3E5E8" }}>
              <b>{tm.termName} {tm.termYear}{current ? " — in progress (provisional)" : ""}</b>
              <span style={{ fontSize: 13 }}>Term GPA <b>{gpa !== null ? gpa.toFixed(2) : "—"}</b> · CGPA <b>{C ? (P / C).toFixed(2) : "—"}</b> · {xs.reduce((a, r) => a + r.creditHours, 0)} CH</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ fontSize: 13, width: "100%" }}>
                <thead><tr><th>Code</th><th>Course</th><th>Type</th><th style={{ textAlign: "center" }}>CH</th><th style={{ textAlign: "center" }}>Marks</th><th style={{ textAlign: "center" }}>Grade</th><th style={{ textAlign: "center" }}>Points</th></tr></thead>
                <tbody>{xs.map((r, i) => (
                  <tr key={i} style={{ background: r.gpaPoints === 0 ? "#FDE2E2" : undefined }}>
                    <td><b>{r.code}</b></td><td>{r.title}{r.isCurrent && !r.approved ? <span className="small-note"> (provisional)</span> : null}</td>
                    <td>{r.courseType ? chip(r.courseType, TYPE_COLOR[r.courseType] || "#555") : "—"}</td>
                    <td style={{ textAlign: "center" }}>{r.creditHours}</td><td style={{ textAlign: "center" }}>{r.totalPct.toFixed(1)}%</td>
                    <td style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: gradeColor(r.grade) }}>{r.grade}</td>
                    <td style={{ textAlign: "center" }}>{r.gpaPoints?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      })}
      {remaining.length > 0 && (
        <div className="card" style={{ borderLeft: `5px solid ${BAD}` }}>
          <h3 style={{ marginTop: 0, color: BAD }}>Still to clear</h3>
          <table style={{ fontSize: 13 }}><tbody>{remaining.map((r) => <tr key={r.code}><td><b>{r.code}</b> {r.title}</td><td>{r.creditHours} CH</td><td style={{ color: BAD, fontWeight: 700 }}>{r.reason === "WITHDRAWN" ? "Dropped" : "Failed"}</td><td className="small-note">{r.lastGrade} — {r.lastTermName} {r.lastTermYear}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

async function PloTab({ studentId }: { studentId: string }) {
  const lines = await ploTranscript(studentId);
  if (!lines.length) return <div className="card small-note">No PLO results yet — they appear when the first course results are approved.</div>;
  return (
    <div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>PLO transcript</h3>
        <p className="small-note" style={{ marginTop: 0 }}>For each PLO: the courses that assessed it and your % in each; attained when the credit-weighted average is 50% or more.</p>
        <table style={{ fontSize: 13, width: "100%" }}>
          <thead><tr><th>PLO</th><th style={{ width: "40%" }}>Attainment</th><th style={{ textAlign: "center" }}>Courses</th><th style={{ textAlign: "center" }}>Status</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.number}>
              <td><b>{l.label}</b><div className="small-note">{l.title}</div></td>
              <td>{l.avg === null ? <span className="small-note">not assessed yet</span> : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 14, background: "#E0E0E0", borderRadius: 7, position: "relative" }}>
                    <div style={{ width: `${Math.min(100, l.avg)}%`, height: 14, borderRadius: 7, background: l.avg >= 70 ? GOOD : l.avg >= 50 ? BLUE : BAD }} />
                    <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 2, background: "#333" }} title="pass mark 50%" />
                  </div>
                  <b style={{ minWidth: 48 }}>{l.avg}%</b>
                </div>
              )}</td>
              <td style={{ textAlign: "center" }}>{l.courses.length}</td>
              <td style={{ textAlign: "center" }}>{l.attained === null ? "—" : <StatusBadge status={l.attained ? "ATTAINED" : "NOT_ATTAINED"} meaning={l.attained ? `The credit-weighted average of this GA across its courses (${l.avg}%) is at or above the 50% pass mark.` : `The credit-weighted average of this GA across its courses (${l.avg}%) is below the 50% pass mark. A remediation or a later course mapped to this GA can make it up.`} />}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {lines.filter((l) => l.courses.length).map((l) => (
        <details key={l.number} className="card">
          <summary style={{ cursor: "pointer" }}><b>{l.label}</b> — {l.courses.length} course(s), {l.avg}%</summary>
          <table style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Course</th><th>Term</th><th style={{ textAlign: "center" }}>%</th><th style={{ textAlign: "center" }}>Met</th></tr></thead>
            <tbody>{l.courses.map((c, i) => <tr key={i}><td><b>{c.code}</b> {c.title}</td><td>{c.term}</td><td style={{ textAlign: "center", color: c.passed ? GOOD : BAD, fontWeight: 700 }}>{c.pct}%</td><td style={{ textAlign: "center" }}>{c.passed ? "✓" : "✗"}</td></tr>)}</tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

async function AuditTab({ studentId }: { studentId: string }) {
  const a = await degreeAudit(studentId);
  if (!a) return null;
  const pct = a.required ? Math.round((100 * a.passed) / a.required) : 0, prog = a.required ? Math.round((100 * a.inProgress) / a.required) : 0;
  const S: Record<string, [string, string]> = { PASSED: ["Passed", GOOD], IN_PROGRESS: ["Studying now", "#F9A825"], FAILED: ["Failed — repeat", BAD], TO_TAKE: ["To take", "#757575"] };
  return (
    <div>
      <div className="card" style={{ borderLeft: `5px solid ${a.eligible ? GOOD : WARN}` }}>
        <h3 style={{ marginTop: 0 }}>Degree audit — {a.program}</h3>
        <div style={{ height: 18, background: "#E0E0E0", borderRadius: 9, overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${pct}%`, background: GOOD }} /><div style={{ width: `${prog}%`, background: "#F9A825" }} />
        </div>
        <p style={{ fontSize: 13, margin: "6px 0" }}><b>{a.passed}</b> of <b>{a.required}</b> credit hours passed ({pct}%), {a.inProgress} in progress. {a.eligible ? <b style={{ color: GOOD }}>All graduation requirements met.</b> : <b style={{ color: WARN }}>Not yet eligible to graduate.</b>}</p>
        <table style={{ fontSize: 13 }}><tbody>{a.graduation.map((g) => <tr key={g.label}><td style={{ fontSize: 16, color: g.ok ? GOOD : BAD }}>{g.ok ? "✓" : "✗"}</td><td><b>{g.label}</b></td><td className="small-note">{g.detail}</td></tr>)}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Requirements by course type</h3>
        {a.groups.map((g) => (
          <div key={g.type} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{chip(g.type, TYPE_COLOR[g.type] || "#555")} <b>{g.passed}/{g.required} CH</b>{g.inProgress ? <span className="small-note">+ {g.inProgress} in progress</span> : null}</div>
            <table style={{ fontSize: 12.5, marginTop: 4 }}><tbody>{g.courses.map((c) => <tr key={c.code}><td style={{ width: 70 }}>Sem {c.semester}</td><td><b>{c.code}</b> {c.title}</td><td>{c.ch} CH</td><td>{chip(S[c.status][0], S[c.status][1])}</td><td style={{ fontWeight: 700, color: c.grade ? gradeColor(c.grade) : undefined }}>{c.grade || ""}</td></tr>)}</tbody></table>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Record checks</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Checks on the transcript entries themselves, for the examination office.</p>
        <table style={{ fontSize: 13 }}><tbody>{a.issues.map((g) => <tr key={g.label}><td style={{ fontSize: 16, color: g.ok ? GOOD : BAD }}>{g.ok ? "✓" : "!"}</td><td><b>{g.label}</b></td><td className="small-note">{g.detail}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
