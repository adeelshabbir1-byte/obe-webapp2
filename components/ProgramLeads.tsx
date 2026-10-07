"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LeadForm from "./LeadForm";

type Coordinator = { id: string; name: string; leadProgram: string | null };

// For one department: who leads each of its programs. A lead is one of the department's Program Coordinators
// (or a new one created here) and has all coordinator tools for their program.
export default function ProgramLeads({ departmentId, programs, coordinators }: { departmentId?: string; programs: string[]; coordinators: Coordinator[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<string | null>(null);

  async function setLead(program: string, userId: string) {
    setError("");
    const res = await fetch("/api/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ program, userId: userId || null, departmentId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Could not save"); return; }
    router.refresh();
  }

  if (programs.length === 0) return <p style={{ color: "var(--slate)", fontSize: 13 }}>This department has no programs yet — tick its programs first.</p>;
  return (
    <>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      <table>
        <thead><tr><th>Program</th><th>Program Lead</th><th></th></tr></thead>
        <tbody>
          {programs.map((p) => {
            const lead = coordinators.find((c) => c.leadProgram === p);
            return (
              <tr key={p}>
                <td>{p}</td>
                <td>
                  <select value={lead?.id || ""} onChange={(e) => setLead(p, e.target.value)}>
                    <option value="">— no lead yet —</option>
                    {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}{c.leadProgram && c.leadProgram !== p ? ` (now leads ${c.leadProgram})` : ""}</option>)}
                  </select>
                </td>
                <td><button className="btn" onClick={() => setCreating(creating === p ? null : p)}>{creating === p ? "Close" : "Create new lead"}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {creating && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>New Program Lead for {creating}</b>
          <LeadForm key={creating} program={creating} departmentId={departmentId} />
        </div>
      )}
    </>
  );
}
