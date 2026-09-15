"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Program = { id: string; name: string; shortCode: string; defaultIntakeSize: number; usuallyOfferedInFall: boolean; usuallyOfferedInSpring: boolean };

export default function DegreeProgramsAndIntakeManager({ programs: initialPrograms }: { programs: Program[] }) {
  const router = useRouter();
  const [programs, setPrograms] = useState(initialPrograms);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function addProgram(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/degree-programs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), shortCode: fd.get("shortCode"), defaultIntakeSize: fd.get("defaultIntakeSize"),
          usuallyOfferedInFall: fd.get("usuallyOfferedInFall") === "on", usuallyOfferedInSpring: fd.get("usuallyOfferedInSpring") === "on",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setPrograms((prev) => [...prev, data.program]); (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeProgram(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/degree-programs/${id}`, { method: "DELETE" });
    setPrograms((prev) => prev.filter((p) => p.id !== id)); setLoading(false);
  }

  const [term, setTerm] = useState<"Fall" | "Spring">("Fall");
  const [year, setYear] = useState(new Date().getFullYear());
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialPrograms.map((p) => [p.id, p.usuallyOfferedInFall]))
  );
  const [result, setResult] = useState<{ created: any[]; skipped: any[] } | null>(null);

  function setTermAndResetChecks(t: "Fall" | "Spring") {
    setTerm(t);
    setChecked(Object.fromEntries(programs.map((p) => [p.id, t === "Fall" ? p.usuallyOfferedInFall : p.usuallyOfferedInSpring])));
  }

  async function createIntake() {
    const programIds = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (programIds.length === 0) { setError("Select at least one program."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/coordinator/new-intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, year, programIds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult(data); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Degree Programs (set up once)</h3>
        <table>
          <thead><tr><th>Name</th><th>Short Code</th><th>Default Intake Size</th><th>Usually Fall?</th><th>Usually Spring?</th><th></th></tr></thead>
          <tbody>
            {programs.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {programs.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.shortCode}</td><td>{p.defaultIntakeSize}</td>
                <td>{p.usuallyOfferedInFall ? "Yes" : "No"}</td><td>{p.usuallyOfferedInSpring ? "Yes" : "No"}</td>
                <td><button onClick={() => removeProgram(p.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addProgram} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}><label>Name</label><input name="name" placeholder="e.g. BS Computer Science" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Short Code</label><input name="shortCode" placeholder="e.g. BSCS" required style={{ width: 90 }} /></div>
          <div className="field" style={{ margin: 0 }}><label>Default Intake Size</label><input name="defaultIntakeSize" type="number" min={1} defaultValue={30} style={{ width: 90 }} /></div>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input name="usuallyOfferedInFall" type="checkbox" defaultChecked /> Fall intake</label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input name="usuallyOfferedInSpring" type="checkbox" /> Spring intake</label>
          <button className="btn btn-brass" type="submit" disabled={loading}>Add Program</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>New Intake Setup</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>Pick the term, then check which programs have a new intake this time — pre-checked based on what's usual, adjust as needed.</p>
        <div style={{ display: "flex", gap: 14, marginBottom: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Term</label>
            <select value={term} onChange={(e) => setTermAndResetChecks(e.target.value as "Fall" | "Spring")} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
              <option value="Fall">Fall</option><option value="Spring">Spring</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Year</label>
            <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {programs.map((p) => (
            <label key={p.id} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={!!checked[p.id]} onChange={(e) => setChecked((prev) => ({ ...prev, [p.id]: e.target.checked }))} />
              {p.shortCode} {term} {year} — {p.name} (intake size {p.defaultIntakeSize})
            </label>
          ))}
          {programs.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Add at least one degree program above first.</p>}
        </div>
        <button onClick={createIntake} disabled={loading} className="btn btn-brass">{loading ? "Creating…" : "Create Selected Intakes"}</button>

        {result && (
          <div style={{ marginTop: 14, fontSize: 12.5 }}>
            {result.created.length > 0 && (
              <div style={{ color: "var(--sage)", marginBottom: 6 }}>
                {result.created.map((c: any) => (
                  <p key={c.batchName}>
                    {c.batchName} created.
                    {c.copiedFrom ? ` Copied ${c.coursesCopied} course(s) and ${c.plosCopied} PLO(s) forward from ${c.copiedFrom}.` : " No earlier batch of this program to copy from — starting empty."}
                  </p>
                ))}
              </div>
            )}
            {result.skipped.length > 0 && (
              <div style={{ color: "var(--rust)" }}>
                {result.skipped.map((s, i) => <p key={i}>{s.degreeProgram}: {s.reason}</p>)}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
