"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeamView = { key: string; code: string; title: string; term: string; leadId: string | null; teachers: { id: string; name: string }[]; rows: { batch: string; teachers: string }[] };

export default function CourseLeadManager({ teams }: { teams: TeamView[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function setLead(teamKey: string, leadId: string) {
    if (!leadId) return;
    setBusy(teamKey); setError("");
    const res = await fetch("/api/course-leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamKey, leadId }) });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(d.error || "Could not save"); return; }
    router.refresh();
  }

  return (
    <>
      {error && <div className="card" style={{ color: "#b3261e" }}>{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Course</th><th>Sections</th><th>Course Lead</th></tr></thead>
          <tbody>
            {teams.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No course is taught by two or more teachers this semester.</td></tr>}
            {teams.map((t) => (
              <tr key={t.key}>
                <td><b>{t.code}</b> — {t.title}{t.term && <div style={{ fontSize: 12, color: "var(--slate)" }}>{t.term}</div>}</td>
                <td style={{ fontSize: 12 }}>{t.rows.map((r, i) => <div key={i}>{r.batch}: {r.teachers}</div>)}</td>
                <td>
                  <select value={t.leadId || ""} disabled={busy === t.key} onChange={(e) => setLead(t.key, e.target.value)}>
                    {!t.leadId && <option value="">— choose the lead —</option>}
                    {t.teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  {!t.leadId && <div style={{ fontSize: 12, color: "#96650F" }}>no lead yet</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
