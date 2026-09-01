"use client";

import { useState, useEffect } from "react";

type Member = { courseId: string; code: string; title: string; batchLabel: string; studentCount: number };
type Group = { id: string; name: string; members: Member[] };
type Available = { id: string; code: string; title: string; batchLabel: string; studentCount: number };

export default function EquivalenceManager() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [available, setAvailable] = useState<Available[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/omc/equivalence");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setGroups(data.groups); setAvailable(data.availableCourses); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); }, []);

  async function createGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/omc/equivalence", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: fd.get("name") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function deleteGroup(groupId: string) {
    setLoading(true);
    await fetch(`/api/omc/equivalence/${groupId}`, { method: "DELETE" });
    setLoading(false); await load();
  }

  async function addMember(groupId: string, courseId: string) {
    if (!courseId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/omc/equivalence/${groupId}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setAddingToGroup(null); setLoading(false); await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeMember(groupId: string, courseId: string) {
    setLoading(true);
    await fetch(`/api/omc/equivalence/${groupId}/members/${courseId}`, { method: "DELETE" });
    setLoading(false); await load();
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;

  return (
    <>
      {error && <div className="err">{error}</div>}

      {groups.map((g) => {
        const total = g.members.reduce((sum, m) => sum + m.studentCount, 0);
        const sections = Math.max(1, Math.ceil(total / 50));
        return (
          <div className="card" key={g.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14 }}>{g.name}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--slate)" }}>
                  {total} combined students → <b style={{ color: sections > 1 ? "var(--rust)" : "var(--ink)" }}>{sections} section{sections === 1 ? "" : "s"} needed</b>
                </span>
                <button onClick={() => deleteGroup(g.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Delete Group</button>
              </div>
            </div>
            <table>
              <thead><tr><th>Course</th><th>Batch</th><th>Students</th><th></th></tr></thead>
              <tbody>
                {g.members.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No courses added yet.</td></tr>}
                {g.members.map((m) => (
                  <tr key={m.courseId}>
                    <td><b>{m.code}</b> {m.title}</td><td style={{ fontSize: 11.5 }}>{m.batchLabel}</td><td>{m.studentCount}</td>
                    <td><button onClick={() => removeMember(g.id, m.courseId)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {addingToGroup === g.id ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <select onChange={(e) => addMember(g.id, e.target.value)} disabled={loading} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                  <option value="">— Select a course to add —</option>
                  {available.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title} ({c.batchLabel})</option>)}
                </select>
                <button onClick={() => setAddingToGroup(null)} style={{ background: "none", border: "none", color: "var(--slate)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingToGroup(g.id)} className="btn btn-brass" style={{ marginTop: 10, padding: "6px 12px", fontSize: 12 }}>+ Add Course</button>
            )}
          </div>
        );
      })}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Create Equivalence Group</h3>
        <form onSubmit={createGroup} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Group Name</label>
            <input name="name" placeholder="Introduction to Programming (shared)" required style={{ padding: "7px 9px", border: "1px solid var(--line)", width: "100%" }} />
          </div>
          <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "7px 14px" }}>Create</button>
        </form>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          Only courses currently offered (and not already in another group) can be added as members.
        </p>
      </div>
    </>
  );
}
