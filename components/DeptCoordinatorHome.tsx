"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Program = { id: string; program: string; lead: string; batches: number; teachers: number; term: string | null };

export default function DeptCoordinatorHome({ programs, actingForId }: { programs: Program[]; actingForId: string | null }) {
  const router = useRouter();
  const [source, setSource] = useState(actingForId || programs[0]?.id || "");
  const [what, setWhat] = useState<{ term: boolean; holidays: boolean }>({ term: true, holidays: true });
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  async function work(id: string, to: string) {
    await fetch("/api/auth/acting-for", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinatorId: id }) });
    router.push(to);
    router.refresh();
  }
  async function copy() {
    setMsg("");
    const res = await fetch("/api/dept-coordinator/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromCoordinatorId: source, term: what.term, holidays: what.holidays }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMsg(res.ok ? `Done. ${d.programs} other program(s) updated${what.term ? " with the semester" : ""}${what.holidays ? `, ${d.holidaysAdded} holiday(s) added` : ""}.` : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="card">
        <table>
          <thead><tr><th>Program</th><th>Program Lead</th><th>Batches</th><th>Teachers</th><th>Semester</th><th></th></tr></thead>
          <tbody>
            {programs.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No Program Leads in your department yet.</td></tr>}
            {programs.map((p) => (
              <tr key={p.id} style={p.id === actingForId ? { background: "rgba(150,101,15,.08)" } : undefined}>
                <td><b>{p.program}</b>{p.id === actingForId && <span style={{ fontSize: 11, marginLeft: 6, color: "var(--slate)" }}>working on</span>}</td>
                <td>{p.lead}</td><td>{p.batches}</td><td>{p.teachers}</td><td>{p.term || <span style={{ color: "#96650F" }}>not set</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-brass" onClick={() => work(p.id, "/coordinator/faculty")}>Teachers</button>{" "}
                  <button className="btn" onClick={() => work(p.id, "/coordinator/students")}>Students</button>{" "}
                  <button className="btn" onClick={() => work(p.id, "/coordinator/timetable")}>Timetable</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {programs.length > 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Apply to all programs of the department</h3>
          <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
            Set the current semester and the holidays once on one program, then copy them to every other program so the whole department runs on the same calendar.
            Holidays are added, never removed.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 13 }}>Copy from{" "}
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.program} ({p.lead})</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={what.term} onChange={(e) => setWhat({ ...what, term: e.target.checked })} /> Current semester</label>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={what.holidays} onChange={(e) => setWhat({ ...what, holidays: e.target.checked })} /> Holidays</label>
            <button className="btn btn-brass" disabled={!source || (!what.term && !what.holidays)} onClick={copy}>Copy to the other programs</button>
          </div>
          {msg && <div style={{ marginTop: 8, fontSize: 13, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
        </div>
      )}
    </>
  );
}
