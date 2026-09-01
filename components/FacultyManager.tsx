"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Faculty = { id: string; username: string; name: string; role: string; mustChangePassword: boolean; normalLoad: number; externalLoadCount: number; externalLoadNote: string | null };

export default function FacultyManager({ initialFaculty }: { initialFaculty: Faculty[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onboard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/faculty", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), username: fd.get("username"), password: fd.get("password"),
          role: fd.get("role"), normalLoad: fd.get("normalLoad"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveLoad(e: React.FormEvent<HTMLFormElement>, userId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/faculty/load", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, normalLoad: fd.get("normalLoad"), externalLoadCount: fd.get("externalLoadCount"), externalLoadNote: fd.get("externalLoadNote") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Login Status</th><th>Load (Normal / External)</th><th></th></tr></thead>
          <tbody>
            {initialFaculty.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No faculty onboarded yet.</td></tr>}
            {initialFaculty.map((f) => editingId === f.id ? (
              <tr key={f.id}>
                <td colSpan={6}>
                  <form onSubmit={(e) => saveLoad(e, f.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{f.name}</span>
                    <div>
                      <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Normal Load</label>
                      <input name="normalLoad" type="number" min={0} defaultValue={f.normalLoad} style={{ width: 60, padding: "5px 6px", border: "1px solid var(--line)" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>External Load (e.g. MS courses)</label>
                      <input name="externalLoadCount" type="number" min={0} defaultValue={f.externalLoadCount} style={{ width: 60, padding: "5px 6px", border: "1px solid var(--line)" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Note</label>
                      <input name="externalLoadNote" defaultValue={f.externalLoadNote || ""} placeholder="2 courses at MS level" style={{ width: 180, padding: "5px 6px", border: "1px solid var(--line)" }} />
                    </div>
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={f.id}>
                <td>{f.username}</td><td>{f.name}</td>
                <td><span className="badge badge-neutral">{f.role === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor"}</span></td>
                <td>{f.mustChangePassword ? <span className="badge badge-warn">Temp Password</span> : <span className="badge badge-ok">Active</span>}</td>
                <td style={{ fontSize: 12 }}>{f.normalLoad} {f.externalLoadCount > 0 ? `+ ${f.externalLoadCount} external` : ""}{f.externalLoadNote ? ` (${f.externalLoadNote})` : ""}</td>
                <td><button onClick={() => setEditingId(f.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit Load</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Onboard Faculty</h3>
        <form onSubmit={onboard}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field"><label>Full name</label><input name="name" required /></div>
            <div className="field"><label>Email</label><input name="email" type="email" required /></div>
            <div className="field"><label>Username</label><input name="username" required /></div>
            <div className="field"><label>Temporary password</label><input name="password" required /></div>
            <div className="field">
              <label>Role</label>
              <select name="role" required>
                <option value="SUBJECT_EXPERT">Subject Expert</option>
                <option value="INSTRUCTOR">Course Instructor</option>
              </select>
            </div>
            <div className="field">
              <label>Normal Load (courses/labs per semester)</label>
              <input name="normalLoad" type="number" min={0} defaultValue={3} />
            </div>
          </div>
          <div className="small-note" style={{ marginBottom: 10 }}>This user will be required to set a new password on first login.</div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Onboarding…" : "Onboard Faculty"}</button>
        </form>
      </div>
    </>
  );
}
