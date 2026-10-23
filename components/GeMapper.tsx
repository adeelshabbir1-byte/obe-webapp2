"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { code: string; title: string; credits: number; type: string; mark: string; suggested: string };

/** Mark which course meets which General Education requirement of the HEC UG Policy 2023. */
export default function GeMapper({ program, courses, reqs }: { program: string; courses: Course[]; reqs: { key: string; label: string }[] }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function save(code: string, requirement: string) {
    setBusy(code); setMsg(null);
    const r = await fetch("/api/quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "policyMap", program, courseCode: code, requirement }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) { setMsg({ ok: true, t: `Saved ${code}.` }); router.refresh(); } else setMsg({ ok: false, t: d.error || "Could not save" });
  }
  const shown = all ? courses : courses.filter((c) => c.mark || c.suggested || /general education|ids/i.test(c.type));
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "4px 0 8px" }}>
        <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all {courses.length} courses</label>
        {msg && <span style={{ fontSize: 12.5, color: msg.ok ? "#1E6B3A" : "#B3261E" }}>{msg.t}</span>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}>
          <thead><tr><th>Course</th><th>Credits</th><th>Type</th><th>Meets the requirement</th></tr></thead>
          <tbody>{shown.map((c) => (
            <tr key={c.code}><td><b>{c.code}</b> {c.title}</td><td>{c.credits}</td><td>{c.type}</td>
              <td>
                <select value={c.mark} disabled={busy === c.code} onChange={(e) => save(c.code, e.target.value)} style={{ minWidth: 220 }} aria-label={`Requirement met by ${c.code}`}>
                  <option value="">{c.suggested ? `Suggested: ${reqs.find((r) => r.key === c.suggested)?.label}` : "—"}</option>
                  {reqs.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  <option value="NONE">Not a General Education course</option>
                </select>
                {c.suggested && !c.mark && <button className="act" style={{ marginLeft: 6 }} disabled={busy === c.code} onClick={() => save(c.code, c.suggested)}>Confirm</button>}
              </td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
