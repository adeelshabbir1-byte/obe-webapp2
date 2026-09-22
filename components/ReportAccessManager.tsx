"use client";

import { useState } from "react";

type ReportDef = { id: string; title: string; hasEditActions?: boolean };
type Rule = { id: string; reportId: string; subjectType: string; subjectValue: string; canView: boolean; canEdit: boolean };
type Person = { id: string; name: string; role: string };

export default function ReportAccessManager({ reports, initialRules: initialRulesProp, people }: { reports: ReportDef[]; initialRules: Rule[]; people: Person[] }) {
  const [initialRules, setRules] = useState<Rule[]>(initialRulesProp);
  const [selectedReportId, setSelectedReportId] = useState(reports[0]?.id || "");
  const [subjectType, setSubjectType] = useState<"ROLE" | "USER">("ROLE");
  const [subjectValue, setSubjectValue] = useState("OMC");
  const [canView, setCanView] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedReport = reports.find((r) => r.id === selectedReportId);
  const rulesForReport = initialRules.filter((r) => r.reportId === selectedReportId);

  async function save() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/chairman/report-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: selectedReportId, subjectType, subjectValue, canView, canEdit }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      // A rule for this exact (report, subjectType, subjectValue) may already exist — this save updates it.
      setRules((prev) => {
        const idx = prev.findIndex((r) => r.reportId === data.rule.reportId && r.subjectType === data.rule.subjectType && r.subjectValue === data.rule.subjectValue);
        if (idx === -1) return [...prev, data.rule];
        const next = [...prev]; next[idx] = data.rule; return next;
      });
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function remove(ruleId: string) {
    setLoading(true);
    await fetch(`/api/chairman/report-access/${ruleId}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    setLoading(false);
  }

  function personName(id: string) { return people.find((p) => p.id === id)?.name || id; }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Report</label>
        <select value={selectedReportId} onChange={(e) => setSelectedReportId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: "100%" }}>
          {reports.map((r) => <option key={r.id} value={r.id}>{r.title}{r.hasEditActions ? " (has editable actions)" : ""}</option>)}
        </select>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Current Rules for This Report</h3>
        <table>
          <thead><tr><th>Applies To</th><th>View</th><th>Edit</th><th></th></tr></thead>
          <tbody>
            {rulesForReport.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No rules set — default open access applies.</td></tr>}
            {rulesForReport.map((r) => (
              <tr key={r.id}>
                <td>{r.subjectType === "ROLE" ? r.subjectValue : personName(r.subjectValue)}{r.subjectType === "USER" && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Individual</span>}</td>
                <td>{r.canView ? "✓" : "✗"}</td>
                <td>{r.canEdit ? "✓" : "✗"}</td>
                <td><button onClick={() => remove(r.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Add / Update a Rule</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Applies To</label>
            <select value={subjectType} onChange={(e) => { setSubjectType(e.target.value as "ROLE" | "USER"); setSubjectValue(e.target.value === "ROLE" ? "OMC" : people[0]?.id || ""); }} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="ROLE">A Role</option>
              <option value="USER">A Specific Person</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>{subjectType === "ROLE" ? "Role" : "Person"}</label>
            {subjectType === "ROLE" ? (
              <select value={subjectValue} onChange={(e) => setSubjectValue(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                <option value="OMC">OMC</option>
                <option value="PROGRAM_COORDINATOR">Program Coordinator</option>
                <option value="SUBJECT_EXPERT">Subject Expert</option>
                <option value="INSTRUCTOR">Instructor</option>
              </select>
            ) : (
              <select value={subjectValue} onChange={(e) => setSubjectValue(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
              </select>
            )}
          </div>
          <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={canView} onChange={(e) => setCanView(e.target.checked)} /> Can View
          </label>
          {selectedReport?.hasEditActions && (
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} /> Can Edit
            </label>
          )}
          <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save Rule"}</button>
        </div>
        {!selectedReport?.hasEditActions && <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>This report has no editable actions, so only view access applies.</p>}
      </div>
    </>
  );
}
