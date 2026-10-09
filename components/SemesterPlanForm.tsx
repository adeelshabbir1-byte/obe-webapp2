"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { key: string; title: string; role: string; offset: number; why: string; phase: string; scope: string };
const input = { padding: "5px 7px", border: "1px solid var(--line)" } as const;
const addDays = (start: string, n: number) => { const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function SemesterPlanForm({ items, roles }: { items: Item[]; roles: { value: string; label: string }[] }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [start, setStart] = useState("");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.key, true])));
  const [roleOf, setRoleOf] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.key, i.role])));
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const phases = Array.from(new Set(items.map((i) => i.phase)));
  function setStartDate(v: string) { setStart(v); setDates(v ? Object.fromEntries(items.map((i) => [i.key, addDays(v, i.offset)])) : {}); }
  async function publish() {
    setMsg("");
    const res = await fetch("/api/semester-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term, startDate: start, items: items.filter((i) => on[i.key] && dates[i.key]).map((i) => ({ key: i.key, dueDate: dates[i.key], role: roleOf[i.key] })) }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? `Plan published with ${d.count} targets. Deans, Chairmen and Program Leads can now pass each one down with their own earlier date.` : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  const count = items.filter((i) => on[i.key]).length;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Set the semester plan</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Enter the semester name and its start date. The dates are suggested from the usual order of work; change any date, change the role a task belongs to, or untick tasks you do not want. Each target is for a role, whoever holds it, never for one person. Publishing the same semester again replaces its earlier plan.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>Semester<br /><input style={{ ...input, width: 170 }} placeholder="Spring 2027" value={term} onChange={(e) => setTerm(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>First day of classes<br /><input style={input} type="date" value={start} onChange={(e) => setStartDate(e.target.value)} /></label>
      </div>
      {start && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th></th><th>Task</th><th>Role</th><th>Complete by</th><th>Against start</th></tr></thead>
            <tbody>{phases.map((ph) => (
              <Fragment key={ph}>
                <tr><td colSpan={5} style={{ background: "rgba(0,0,0,0.04)", fontWeight: 700 }}>{ph}</td></tr>
                {items.filter((i) => i.phase === ph).map((i) => (
                  <tr key={i.key}>
                    <td><input type="checkbox" checked={on[i.key]} onChange={(e) => setOn({ ...on, [i.key]: e.target.checked })} /></td>
                    <td><b>{i.title}</b><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{i.why}{i.scope === "COURSE" ? " · tracked per course" : i.scope === "EACH" ? " · one for each person in the role" : ""}</div></td>
                    <td><select style={input} value={roleOf[i.key]} onChange={(e) => setRoleOf({ ...roleOf, [i.key]: e.target.value })}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></td>
                    <td><input style={input} type="date" value={dates[i.key] || ""} onChange={(e) => setDates({ ...dates, [i.key]: e.target.value })} /></td>
                    <td style={{ fontSize: 12, color: "var(--slate)", whiteSpace: "nowrap" }}>{i.offset < 0 ? `${-i.offset} days before` : i.offset === 0 ? "start day" : `${i.offset} days after`}</td>
                  </tr>
                ))}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn" onClick={publish} disabled={!start || !term}>Publish plan ({count} tasks)</button>
        <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
    </div>
  );
}
