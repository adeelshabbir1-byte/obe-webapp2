"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Alum = { id: string; name: string; email: string | null; rollNumber: string; degreeProgram: string; graduationYear: number; totalWorkExperienceYears: number | null; status: string };
type Employer = { id: string; organizationName: string; contactName: string | null; contactEmail: string | null; companySize: string | null; industryType: string | null; status: string };
type Employment = { id: string; alumniId: string; employerId: string; jobTitle: string | null; startDate: string | null; endDate: string | null; salaryRange: string | null; status: string };

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

export default function StakeholdersManager({ alumni, employers, employment }: { alumni: Alum[]; employers: Employer[]; employment: Employment[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [empAlumniId, setEmpAlumniId] = useState(alumni[0]?.id || "");
  const [empEmployerId, setEmpEmployerId] = useState(employers[0]?.id || "");

  async function addAlumni(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/alumni", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), rollNumber: fd.get("rollNumber"),
          degreeProgram: fd.get("degreeProgram"), graduationYear: fd.get("graduationYear"),
          totalWorkExperienceYears: fd.get("totalWorkExperienceYears") || null,
        }),
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
        body: JSON.stringify({
          organizationName: fd.get("organizationName"), contactName: fd.get("contactName"), contactEmail: fd.get("contactEmail"),
          companySize: fd.get("companySize"), industryType: fd.get("industryType"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addEmployment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!empAlumniId || !empEmployerId) { setError("Pick both an alumni and an employer."); return; }
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/alumni-employment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumniId: empAlumniId, employerId: empEmployerId, jobTitle: fd.get("jobTitle"),
          startDate: fd.get("startDate"), endDate: fd.get("endDate") || null, salaryRange: fd.get("salaryRange"),
        }),
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
  async function removeEmployment(id: string) {
    setLoading(true);
    await fetch(`/api/coordinator/alumni-employment/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  function alumName(id: string) { return alumni.find((a) => a.id === id)?.name || "—"; }
  function employerName(id: string) { return employers.find((e) => e.id === id)?.organizationName || "—"; }

  function StatusBadge({ status }: { status: string }) {
    if (status === "APPROVED") return <span className="badge badge-ok">Approved</span>;
    if (status === "REJECTED") return <span className="badge badge-no">Rejected</span>;
    return <span className="badge badge-warn">Pending Review</span>;
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Alumni</h3>
        <table>
          <thead><tr><th>Roll #</th><th>Name</th><th>Email</th><th>Degree</th><th>Grad. Year</th><th>Work Exp.</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {alumni.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {alumni.map((a) => (
              <tr key={a.id}>
                <td>{a.rollNumber}</td><td>{a.name}</td><td>{a.email || "—"}</td><td>{a.degreeProgram}</td><td>{a.graduationYear}</td>
                <td>{a.totalWorkExperienceYears !== null ? `${a.totalWorkExperienceYears} yrs` : "—"}</td>
                <td><StatusBadge status={a.status} /></td>
                <td><button onClick={() => removeAlumni(a.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addAlumni} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}><label>Roll Number</label><input name="rollNumber" required style={{ width: 120 }} /></div>
          <div className="field" style={{ margin: 0 }}><label>Name</label><input name="name" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Email (optional)</label><input name="email" type="email" /></div>
          <div className="field" style={{ margin: 0 }}><label>Degree Program</label><input name="degreeProgram" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Graduation Year</label><input name="graduationYear" type="number" required style={{ width: 100 }} /></div>
          <div className="field" style={{ margin: 0 }}><label>Work Exp. (yrs, optional)</label><input name="totalWorkExperienceYears" type="number" min={0} style={{ width: 100 }} /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>Add Alumni</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Employers</h3>
        <table>
          <thead><tr><th>Organization</th><th>Contact Name</th><th>Contact Email</th><th>Size</th><th>Industry</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {employers.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>None added yet.</td></tr>}
            {employers.map((e) => (
              <tr key={e.id}>
                <td>{e.organizationName}</td><td>{e.contactName || "—"}</td><td>{e.contactEmail || "—"}</td>
                <td>{e.companySize || "—"}</td><td>{e.industryType || "—"}</td>
                <td><StatusBadge status={e.status} /></td>
                <td><button onClick={() => removeEmployer(e.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addEmployer} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}><label>Organization Name</label><input name="organizationName" required /></div>
          <div className="field" style={{ margin: 0 }}><label>Contact Name (optional)</label><input name="contactName" /></div>
          <div className="field" style={{ margin: 0 }}><label>Contact Email (optional)</label><input name="contactEmail" type="email" /></div>
          <div className="field" style={{ margin: 0 }}>
            <label>Company Size</label>
            <select name="companySize" style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
              <option value="">— Unspecified —</option>
              {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}><label>Industry / Kind of Work (optional)</label><input name="industryType" placeholder="e.g. Software Development" /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>Add Employer</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Employment History</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          One alumnus can have multiple employers over time, and one employer can have multiple alumni — this is
          the record connecting them.
        </p>
        <table>
          <thead><tr><th>Alumni</th><th>Employer</th><th>Title</th><th>Start</th><th>End</th><th>Salary Range</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {employment.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No employment records yet.</td></tr>}
            {employment.map((e) => (
              <tr key={e.id}>
                <td>{alumName(e.alumniId)}</td><td>{employerName(e.employerId)}</td><td>{e.jobTitle || "—"}</td>
                <td>{e.startDate || "—"}</td><td>{e.endDate || <span style={{ color: "var(--sage)" }}>Current</span>}</td><td>{e.salaryRange || "—"}</td>
                <td><StatusBadge status={e.status} /></td>
                <td><button onClick={() => removeEmployment(e.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {alumni.length === 0 || employers.length === 0 ? (
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 12 }}>Add at least one alumni and one employer above before recording employment.</p>
        ) : (
          <form onSubmit={addEmployment} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Alumni</label>
              <select value={empAlumniId} onChange={(e) => setEmpAlumniId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                {alumni.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.rollNumber})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Employer</label>
              <select value={empEmployerId} onChange={(e) => setEmpEmployerId(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                {employers.map((e) => <option key={e.id} value={e.id}>{e.organizationName}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}><label>Job Title</label><input name="jobTitle" /></div>
            <div className="field" style={{ margin: 0 }}><label>Start Date</label><input name="startDate" type="date" /></div>
            <div className="field" style={{ margin: 0 }}><label>End Date (blank = current)</label><input name="endDate" type="date" /></div>
            <div className="field" style={{ margin: 0 }}><label>Salary Range (optional)</label><input name="salaryRange" placeholder="e.g. PKR 80,000 - 100,000" /></div>
            <button className="btn btn-brass" type="submit" disabled={loading}>Add Employment Record</button>
          </form>
        )}
      </div>
    </>
  );
}
