"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";

type Faculty = { id: string; username: string; name: string; role: string; mustChangePassword: boolean; normalLoad: number; externalLoadCount: number; externalLoadNote: string | null; specialization: string | null; secondaryRole: string | null };

export default function FacultyManager({ initialFaculty }: { initialFaculty: Faculty[] }) {
  const [faculty, setFaculty] = useState<Faculty[]>(initialFaculty);
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
          role: fd.get("role"), normalLoad: fd.get("normalLoad"), specialization: fd.get("specialization"),
          secondaryRole: fd.get("alsoInstructor") === "on" ? "INSTRUCTOR" : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setFaculty((prev) => [...prev, data.user]);
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function resetPassword(userId: string, name: string) {
    const newPassword = prompt(`Set a new temporary password for ${name}. They'll be required to change it on their next login.`);
    if (!newPassword) return;
    if (newPassword.length < 6) { alert("Password must be at least 6 characters."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/faculty/${userId}/reset-password`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      alert(`Password reset. Give ${name} their new temporary password directly — it isn't stored anywhere retrievable.`);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeFaculty(userId: string, name: string) {
    const proceed = confirm(`Delete ${name}'s account permanently? This cannot be undone.`);
    if (!proceed) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/faculty/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setFaculty((prev) => prev.filter((f) => f.id !== userId));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveLoad(e: React.FormEvent<HTMLFormElement>, userId: string, currentRole: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newRole = fd.get("role") as string;
    if (newRole !== currentRole) {
      const proceed = confirm(
        `Change this faculty member's role from ${currentRole === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor"} to ${newRole === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor"}?\n\nTheir existing course assignments stay intact, but they'll stop appearing in "${currentRole === "SUBJECT_EXPERT" ? "Subject Expert" : "Instructor"}" dropdowns for new assignments and start appearing under the new role instead.`
      );
      if (!proceed) return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/faculty/load", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole, normalLoad: fd.get("normalLoad"), externalLoadCount: fd.get("externalLoadCount"), externalLoadNote: fd.get("externalLoadNote"), specialization: fd.get("specialization"), secondaryRole: fd.get("alsoInstructorEdit") === "on" ? "INSTRUCTOR" : null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setFaculty((prev) => prev.map((f) => f.id === userId ? { ...f, ...data.user } : f));
      setEditingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <SortableTable>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Login Status</th><th>Specialization</th><th>Load (Normal / External)</th><th></th></tr></thead>
          <tbody>
            {faculty.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No faculty onboarded yet.</td></tr>}
            {faculty.map((f) => editingId === f.id ? (
              <tr key={f.id}>
                <td colSpan={7}>
                  <form onSubmit={(e) => saveLoad(e, f.id, f.role)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{f.name}</span>
                    <div>
                      <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Role</label>
                      <select name="role" defaultValue={f.role} style={{ padding: "5px 6px", border: "1px solid var(--line)" }}>
                        <option value="SUBJECT_EXPERT">Subject Expert</option>
                        <option value="INSTRUCTOR">Course Instructor</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Specialization</label>
                      <input name="specialization" defaultValue={f.specialization || ""} placeholder="e.g. Software Engineering" style={{ width: 160, padding: "5px 6px", border: "1px solid var(--line)" }} />
                    </div>
                    {f.role === "SUBJECT_EXPERT" && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                        <input type="checkbox" name="alsoInstructorEdit" defaultChecked={f.secondaryRole === "INSTRUCTOR"} /> Can also be Instructor
                      </label>
                    )}
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
                <td><span className="badge badge-neutral">{f.role === "SUBJECT_EXPERT" ? "Subject Expert" : "Course Instructor"}</span>{f.secondaryRole === "INSTRUCTOR" && <span className="badge badge-ok" style={{ marginLeft: 4 }}>+ Instructor</span>}</td>
                <td>{f.mustChangePassword ? <span className="badge badge-warn">Temp Password</span> : <span className="badge badge-ok">Active</span>}</td>
                <td style={{ fontSize: 12 }}>{f.specialization || <span style={{ color: "var(--slate)" }}>—</span>}</td>
                <td style={{ fontSize: 12 }}>{f.normalLoad} {f.externalLoadCount > 0 ? `+ ${f.externalLoadCount} external` : ""}{f.externalLoadNote ? ` (${f.externalLoadNote})` : ""}</td>
                <td><button onClick={() => setEditingId(f.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0, marginRight: 10 }}>Edit</button>
                <button onClick={() => resetPassword(f.id, f.name)} disabled={loading} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0, marginRight: 10 }}>Reset Password</button>
                <button onClick={() => removeFaculty(f.id, f.name)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
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
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 400, marginTop: 6 }}>
                <input type="checkbox" name="alsoInstructor" /> If Subject Expert: can also be assigned as Instructor
              </label>
            </div>
            <div className="field">
              <label>Normal Load (courses/labs per semester)</label>
              <input name="normalLoad" type="number" min={0} defaultValue={3} />
            </div>
            <div className="field">
              <label>Specialization (optional)</label>
              <input name="specialization" placeholder="e.g. Software Engineering, AI, Networks" />
            </div>
          </div>
          <div className="small-note" style={{ marginBottom: 10 }}>This user will be required to set a new password on first login.</div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Onboarding…" : "Onboard Faculty"}</button>
        </form>
      </div>
    </>
  );
}
