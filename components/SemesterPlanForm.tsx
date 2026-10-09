"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { key: string; title: string; roleLabel: string; offset: number; why: string };
const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;
const addDays = (start: string, n: number) => { const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function SemesterPlanForm({ items }: { items: Item[] }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [start, setStart] = useState("");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.key, true])));
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  function setStartDate(v: string) { setStart(v); setDates(v ? Object.fromEntries(items.map((i) => [i.key, addDays(v, i.offset)])) : {}); }
  async function publish() {
    setMsg("");
    const res = await fetch("/api/semester-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term, startDate: start, items: items.filter((i) => on[i.key] && dates[i.key]).map((i) => ({ key: i.key, dueDate: dates[i.key] })) }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Plan published. Deans, Chairmen and Program Leads can now pass each target down with their own earlier date." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Set the semester plan</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Enter the semester name and its start date. The dates below are suggested from the usual order of work; change any of them. Each target is for a role, whoever holds it, never for one person. Publishing the same semester again replaces its earlier plan.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>Semester<br /><input style={{ ...input, width: 170 }} placeholder="Spring 2027" value={term} onChange={(e) => setTerm(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>First day of classes<br /><input style={input} type="date" value={start} onChange={(e) => setStartDate(e.target.value)} /></label>
      </div>
      {start && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th></th><th>Task</th><th>Role</th><th>Complete by</th><th>Against semester start</th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.key}>
                <td><input type="checkbox" checked={on[i.key]} onChange={(e) => setOn({ ...on, [i.key]: e.target.checked })} /></td>
                <td><b>{i.title}</b><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{i.why}</div></td>
                <td>{i.roleLabel}</td>
                <td><input style={input} type="date" value={dates[i.key] || ""} onChange={(e) => setDates({ ...dates, [i.key]: e.target.value })} /></td>
                <td style={{ fontSize: 12, color: "var(--slate)" }}>{i.offset < 0 ? `${-i.offset} days before` : `${i.offset} days after`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn" onClick={publish} disabled={!start || !term}>Publish plan</button>
        <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
    </div>
  );
}
