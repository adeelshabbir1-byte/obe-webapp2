import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT } from "../../../lib/consortium";
import { planFor, validatePlan, audit, type Graduation } from "../../../lib/consortiumJoint";

export const dynamic = "force-dynamic";
export const metadata = { title: "Joint degree plan" };

// A joint-programme student: where to take each course (lead or a partner with an approved equivalent), checked
// against every rule as they change it; then the degree audit and graduation.
export default async function JointPlan() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const shell = (x: React.ReactNode) => <StudentShell studentName={st.name}>{x}</StudentShell>;
  const p = await planFor(st.id).catch(() => undefined);
  if (p === undefined) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  if (!p) return shell(<><h1 style={{ fontSize: 22 }}>My Joint Degree Plan</h1><div className="card">You are not in a joint degree programme. Single courses at other universities: <Link href="/student/consortium">Courses at Other Universities</Link>.</div></>);
  const v = validatePlan({ ...p, home: p.lead });
  const au = await audit(st.id);
  const g = (await cdb.consortiumGraduation.findFirst({ where: { studentId: st.id, agreementId: p.agreement.id } }).catch(() => null)) as Graduation | null;
  const sems = Array.from(new Set(p.courses.map((c) => c.semester ?? 0))).sort((a, b) => a - b);
  const where = (id: string) => p.choice[id] || p.lead;
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>{p.agreement.title}</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>A joint degree of {[p.lead, ...p.partners].map((u) => p.names[u]).join(" and ")}, awarded by both. Choose where you take each course — at {p.names[p.lead]}, or at a partner where an approved equivalent exists. Every change is checked against the rules below; register for a partner&apos;s course in <Link href="/student/consortium">Courses at Other Universities</Link> when it opens.</p>
    <div className="card" style={{ borderLeft: `4px solid ${v.ok ? "#2E7D32" : "#C62828"}` }}>
      <h3 style={{ marginTop: 0 }}>{v.ok ? "Your plan meets every rule" : "Your plan does not meet every rule yet"}</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4, fontSize: 13 }}>{v.checks.map((c) => <li key={c.rule}><b style={{ color: c.ok ? "#2E7D32" : "#C62828", display: "inline-block", width: 16 }}>{c.ok ? "✓" : "✗"}</b> <b>{c.rule}</b> — <span className="small-note">{c.why}</span></li>)}</ul>
      <div className="small-note" style={{ marginTop: 6 }}>{Object.entries(v.byUni).map(([u, ch]) => `${p.names[u]}: ${ch} CH`).join(" · ")} · total {v.total} CH</div>
    </div>
    {sems.map((sm) => { const cs = p.courses.filter((c) => (c.semester ?? 0) === sm); return (
      <div key={sm} className="card"><h3 style={{ marginTop: 0 }}>{sm ? `Semester ${sm}` : "Not placed in a semester"} <span className="small-note">{cs.reduce((t, c) => t + c.ch, 0)} CH</span></h3>
        <table style={{ fontSize: 13 }}><tbody>{cs.map((c) => { const at = where(c.id); return (
          <tr key={c.id}><td><b>{c.code}</b> {c.title} <span className="small-note">{c.ch} CH{c.capstone ? " · capstone" : ""}</span></td>
            <td style={{ fontWeight: 700, color: at === p.lead ? "#0D2A4A" : "#6A1B9A" }}>{p.names[at]}{at !== p.lead ? <div className="small-note" style={{ fontWeight: 400 }}>{c.options.find((o) => o.chairmanId === at)?.label}{c.options.find((o) => o.chairmanId === at)?.offered ? ` · open ${c.options.find((o) => o.chairmanId === at)!.offered}` : ""}</div> : null}</td>
            <td>{c.options.length ? <ActionForm url="/api/student/consortium" fixed={{ action: "plan", courseId: c.id }} submit="Save" collapsed openLabel="Change…" initial={{ chairmanId: at }} showMessage
              fields={[{ name: "chairmanId", label: "Take it at", type: "select", width: 320, options: [[p.lead, `${p.names[p.lead]} (lead)`] as [string, string], ...c.options.map((o) => [o.chairmanId, `${o.label}${o.offered ? ` — open ${o.offered}` : ""}`] as [string, string])] }]} /> : <span className="small-note">only at {p.names[p.lead]}</span>}</td></tr>); })}</tbody></table></div>); })}
    {au && <div className="card"><h3 style={{ marginTop: 0 }}>Degree audit</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4, fontSize: 13 }}>{au.checks.map((c) => <li key={c.rule}><b style={{ color: c.ok ? "#2E7D32" : "#B26A00", display: "inline-block", width: 16 }}>{c.ok ? "✓" : "…"}</b> <b>{c.rule}</b> — <span className="small-note">{c.why}</span></li>)}</ul>
      <p className="small-note">{g?.status === "ISSUED" ? `Degree record issued: ${g.serial}.` : g?.status === "APPROVED" ? "Approved by every university — the record is being issued." : g ? "Your degree audit is with the universities for approval." : "When you have completed the programme, the lead university runs your degree audit and both universities approve it."}</p></div>}
  </>);
}
