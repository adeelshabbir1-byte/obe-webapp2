"use client";

import { useState } from "react";

type AlumniRow = { id: string; name: string; rollNumber: string; degreeProgram: string; graduationYear: number; submitterName: string };
type EmployerRow = { id: string; organizationName: string; companySize: string | null; industryType: string | null; submitterName: string };
type EmploymentRow = { id: string; alumniName: string; employerName: string; jobTitle: string | null; submitterName: string };
type DegreeRow = { id: string; alumniName: string; degreeName: string; institution: string; submitterName: string };

export default function AlumniReviewManager({ alumni: initialAlumni, employers: initialEmployers, employment: initialEmployment, degrees: initialDegrees }: { alumni: AlumniRow[]; employers: EmployerRow[]; employment: EmploymentRow[]; degrees: DegreeRow[] }) {
  const [alumni, setAlumni] = useState<AlumniRow[]>(initialAlumni);
  const [employers, setEmployers] = useState<EmployerRow[]>(initialEmployers);
  const [employment, setEmployment] = useState<EmploymentRow[]>(initialEmployment);
  const [degrees, setDegrees] = useState<DegreeRow[]>(initialDegrees);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(type: "alumni" | "employer" | "employment" | "degree", id: string, decision: "APPROVED" | "REJECTED") {
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/faculty/alumni-review/${type}/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      if (type === "alumni") setAlumni((prev) => prev.filter((a) => a.id !== id));
      else if (type === "employer") setEmployers((prev) => prev.filter((e) => e.id !== id));
      else if (type === "employment") setEmployment((prev) => prev.filter((e) => e.id !== id));
      else setDegrees((prev) => prev.filter((d) => d.id !== id));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  function Actions({ type, id }: { type: "alumni" | "employer" | "employment" | "degree"; id: string }) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => decide(type, id, "APPROVED")} disabled={busyId === id} className="btn btn-brass" style={{ padding: "3px 10px", fontSize: 11 }}>Approve</button>
        <button onClick={() => decide(type, id, "REJECTED")} disabled={busyId === id} style={{ background: "none", border: "1px solid var(--rust)", color: "var(--rust)", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Reject</button>
      </div>
    );
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending Alumni ({alumni.length})</h3>
        <table>
          <thead><tr><th>Roll #</th><th>Name</th><th>Degree</th><th>Grad Year</th><th>Submitted By</th><th></th></tr></thead>
          <tbody>
            {alumni.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>Nothing pending.</td></tr>}
            {alumni.map((a) => (
              <tr key={a.id}>
                <td>{a.rollNumber}</td><td>{a.name}</td><td>{a.degreeProgram}</td><td>{a.graduationYear}</td><td>{a.submitterName}</td>
                <td><Actions type="alumni" id={a.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending Employers ({employers.length})</h3>
        <table>
          <thead><tr><th>Organization</th><th>Size</th><th>Industry</th><th>Submitted By</th><th></th></tr></thead>
          <tbody>
            {employers.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing pending.</td></tr>}
            {employers.map((e) => (
              <tr key={e.id}>
                <td>{e.organizationName}</td><td>{e.companySize || "—"}</td><td>{e.industryType || "—"}</td><td>{e.submitterName}</td>
                <td><Actions type="employer" id={e.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending Employment Records ({employment.length})</h3>
        <table>
          <thead><tr><th>Alumni</th><th>Employer</th><th>Job Title</th><th>Submitted By</th><th></th></tr></thead>
          <tbody>
            {employment.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing pending.</td></tr>}
            {employment.map((e) => (
              <tr key={e.id}>
                <td>{e.alumniName}</td><td>{e.employerName}</td><td>{e.jobTitle || "—"}</td><td>{e.submitterName}</td>
                <td><Actions type="employment" id={e.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending Additional Degrees ({degrees.length})</h3>
        <table>
          <thead><tr><th>Alumni</th><th>Degree</th><th>Institution</th><th>Submitted By</th><th></th></tr></thead>
          <tbody>
            {degrees.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing pending.</td></tr>}
            {degrees.map((d) => (
              <tr key={d.id}>
                <td>{d.alumniName}</td><td>{d.degreeName}</td><td>{d.institution}</td><td>{d.submitterName}</td>
                <td><Actions type="degree" id={d.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
