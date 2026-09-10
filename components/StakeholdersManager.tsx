"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Alum = { id: string; name: string; email: string | null; degreeProgram: string; graduationYear: number };
type Employer = { id: string; organizationName: string; contactName: string | null; contactEmail: string | null };

export default function StakeholdersManager({ alumni, employers }: { alumni: Alum[]; employers: Employer[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function addAlumni(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/alumni", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), degreeProgram: fd.get("degreeProgram"), graduationYear: fd.get("graduationYear") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addEmployer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/employers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName: fd.get("organizationName"), contactName: fd.get("contactName"), contactEmail: fd.get("contactEmail") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeAlumni(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/alumni/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }
  async function removeEmployer(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/employers/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Alumni</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Degree</th><th>Graduation Year</th><th></th></tr></thead>
          <tbody>
            {alumni.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {alumni.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td><td>{a.email || "—"}</td><td>{a.degreeProgram}</td><td>{a.graduationYear}</td>
                <td><button onClick={() => removeAlumni(a.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addAlumni} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}><label>Name</label><input name="name" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Email (optional)</label><input name="email" type="email" /></div>
          <div className="field" style={{ margin: 0 }}><label>Degree Program</label><input name="degreeProgram" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Graduation Year</label><input name="graduationYear" type="number" required style={{ width: 100 }} /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>Add Alumni</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Employers</h3>
        <table>
          <thead><tr><th>Organization</th><th>Contact Name</th><th>Contact Email</th><th></th></tr></thead>
          <tbody>
            {employers.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {employers.map((e) => (
              <tr key={e.id}>
                <td>{e.organizationName}</td><td>{e.contactName || "—"}</td><td>{e.contactEmail || "—"}</td>
                <td><button onClick={() => removeEmployer(e.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addEmployer} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}><label>Organization Name</label><input name="organizationName" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Contact Name (optional)</label><input name="contactName" /></div>
          <div className="field" style={{ margin: 0 }}><label>Contact Email (optional)</label><input name="contactEmail" type="email" /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>Add Employer</button>
        </form>
      </div>
    </>
  );
}
