"use client";

import { useEffect, useState } from "react";

type CreditRule = { label: string; codes: string[]; titleContains: string; minCredits: number };
type Policy = { lowCgpaThreshold: number; minCreditsNormal: number; maxCreditsNormal: number; maxCreditsLowCgpa: number; maxNewCoursesLowCgpa: number; maxCreditsFinalYear: number; maxCreditsSummer: number; allowConcurrentPrereq: boolean; creditRules: CreditRule[] };
type Exemption = { id: string; rule: string; courseCode: string | null; value: number | null; reason: string; createdAt: string; revokedAt: string | null; student: { name: string; rollNumber: string } | null; grantedBy: string };

export default function RegistrationRulesManager() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [rules, setRules] = useState<Record<string, string>>({});
  const [canExempt, setCanExempt] = useState(false);
  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ex, setEx] = useState({ rollNumber: "", rule: "CREDIT_REQUIREMENT", courseCode: "", value: "", reason: "" });

  async function load() {
    const r = await fetch("/api/registration-rules"); const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Could not load the rules." }); return; }
    setPolicy(d.policy); setRules(d.rules); setCanExempt(d.canExempt); setExemptions(d.exemptions);
  }
  useEffect(() => { load(); }, []);
  if (!policy) return <p>{msg?.text || "Loading…"}</p>;

  const set = (k: keyof Policy, v: unknown) => setPolicy({ ...policy, [k]: v } as Policy);
  const setRule = (i: number, k: keyof CreditRule, v: unknown) => set("creditRules", policy.creditRules.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/registration-rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: "Rules saved. They apply to every registration from now on." } : { ok: false, text: d.error || "Could not save." });
    setBusy(false); if (r.ok) load();
  }
  async function grant(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch("/api/registration-rules/exemptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ex) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: `Exemption granted to ${d.student}.` } : { ok: false, text: d.error || "Could not grant." });
    if (r.ok) { setEx({ ...ex, rollNumber: "", courseCode: "", value: "", reason: "" }); load(); }
    setBusy(false);
  }
  async function revoke(id: string) {
    if (!confirm("Revoke this exemption?")) return;
    await fetch(`/api/registration-rules/exemptions?id=${id}`, { method: "DELETE" }); load();
  }
  const num = (k: keyof Policy, label: string, hint: string, step = 1) => (
    <label style={{ display: "block", fontSize: 13, marginBottom: 10 }}>
      <span style={{ display: "inline-block", minWidth: 330 }}>{label}</span>
      <input type="number" step={step} value={policy[k] as number} onChange={(e) => set(k, Number(e.target.value))} style={{ width: 80, padding: "4px 6px" }} />
      <span style={{ fontSize: 11.5, color: "var(--slate)", marginLeft: 8 }}>{hint}</span>
    </label>
  );

  return (
    <>
      {msg && <div className="card" style={{ color: msg.ok ? "var(--sage)" : "#b3261e" }}>{msg.text}</div>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Semester load</h3>
        {num("minCreditsNormal", "Minimum credit hours in a regular semester", "")}
        {num("maxCreditsNormal", "Maximum credit hours in a regular semester", "")}
        {num("maxCreditsFinalYear", "Maximum for final-year students", "last two semesters of the program")}
        {num("maxCreditsSummer", "Maximum in a summer semester", "")}
        <h3>Low CGPA</h3>
        {num("lowCgpaThreshold", "CGPA below which a student counts as low CGPA", "students on warning or probation are treated the same way", 0.05)}
        {num("maxCreditsLowCgpa", "Maximum credit hours while CGPA is low", "")}
        {num("maxNewCoursesLowCgpa", "Maximum NEW courses per semester while CGPA is low", "retakes and repeats of D grades don't count")}
        <p style={{ fontSize: 12, color: "var(--slate)" }}>Low-CGPA students and students on warning or probation can&apos;t register themselves: their advisor locks their degree plan and registers them from it (or Run Default Enrollment does).</p>
        <h3>Prerequisites</h3>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={policy.allowConcurrentPrereq} onChange={(e) => set("allowConcurrentPrereq", e.target.checked)} /> Allow taking a course in the same semester as its (not yet passed) prerequisite</label>
        <p style={{ fontSize: 12, color: "var(--slate)" }}>Leave this off to require the prerequisite to be passed first; the Institute Head can still allow it for one student.</p>
        <h3>Earned credit hours needed for a course</h3>
        <table>
          <thead><tr><th>Name</th><th>Course codes (comma separated)</th><th>…or title contains</th><th>Earned credit hours needed</th><th></th></tr></thead>
          <tbody>
            {policy.creditRules.map((r, i) => (
              <tr key={i}>
                <td><input value={r.label} onChange={(e) => setRule(i, "label", e.target.value)} placeholder="Final Year Project" style={{ width: 170 }} /></td>
                <td><input value={r.codes.join(", ")} onChange={(e) => setRule(i, "codes", e.target.value.split(/[,\s]+/).filter(Boolean))} placeholder="SEN4996, CSC4996" style={{ width: 200 }} /></td>
                <td><input value={r.titleContains} onChange={(e) => setRule(i, "titleContains", e.target.value)} placeholder="Final Year Project" style={{ width: 170 }} /></td>
                <td><input type="number" value={r.minCredits} onChange={(e) => setRule(i, "minCredits", Number(e.target.value))} style={{ width: 70 }} /></td>
                <td><button className="act act-danger" onClick={() => set("creditRules", policy.creditRules.filter((_, j) => j !== i))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => set("creditRules", [...policy.creditRules, { label: "", codes: [], titleContains: "", minCredits: 0 }])}>+ Add a rule</button>
        <div style={{ marginTop: 16 }}><button className="btn btn-brass" disabled={busy} onClick={save}>Save rules</button></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Exemptions for individual students</h3>
        {canExempt ? (
          <form onSubmit={grant} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <label style={{ fontSize: 12 }}>Roll number<br /><input required value={ex.rollNumber} onChange={(e) => setEx({ ...ex, rollNumber: e.target.value })} style={{ width: 130 }} /></label>
            <label style={{ fontSize: 12 }}>Rule<br /><select value={ex.rule} onChange={(e) => setEx({ ...ex, rule: e.target.value })}>{Object.entries(rules).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {["CREDIT_REQUIREMENT", "CONCURRENT_PREREQ"].includes(ex.rule) && <label style={{ fontSize: 12 }}>Course code (empty = any)<br /><input value={ex.courseCode} onChange={(e) => setEx({ ...ex, courseCode: e.target.value })} style={{ width: 110 }} /></label>}
            {["MAX_LOAD", "NEW_COURSE_LIMIT"].includes(ex.rule) && <label style={{ fontSize: 12 }}>{ex.rule === "MAX_LOAD" ? "Allowed credit hours" : "Allowed new courses"}<br /><input type="number" required value={ex.value} onChange={(e) => setEx({ ...ex, value: e.target.value })} style={{ width: 80 }} /></label>}
            <label style={{ fontSize: 12, flex: 1, minWidth: 220 }}>Reason<br /><input required value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} style={{ width: "100%" }} /></label>
            <button className="btn btn-brass" disabled={busy}>Grant exemption</button>
          </form>
        ) : <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Only the Institute Head can grant exemptions. They are listed here for the OMC to see.</p>}
        <table>
          <thead><tr><th>Student</th><th>Rule</th><th>Course / value</th><th>Reason</th><th>Granted</th><th></th></tr></thead>
          <tbody>
            {exemptions.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No exemptions yet.</td></tr>}
            {exemptions.map((e) => (
              <tr key={e.id} style={{ opacity: e.revokedAt ? 0.5 : 1 }}>
                <td>{e.student ? `${e.student.rollNumber} — ${e.student.name}` : "—"}</td>
                <td>{rules[e.rule] || e.rule}</td>
                <td>{e.courseCode || (e.value !== null ? e.value : "any")}</td>
                <td>{e.reason}</td>
                <td style={{ fontSize: 12 }}>{new Date(e.createdAt).toLocaleDateString("en-GB")} by {e.grantedBy}{e.revokedAt ? ` · revoked ${new Date(e.revokedAt).toLocaleDateString("en-GB")}` : ""}</td>
                <td>{canExempt && !e.revokedAt && <button className="act act-danger" onClick={() => revoke(e.id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
