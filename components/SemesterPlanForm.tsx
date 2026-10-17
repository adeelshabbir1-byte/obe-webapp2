"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { key: string; title: string; role: string; offset: number; why: string; phase: string; scope: string };
const input = { padding: "5px 7px", border: "1px solid var(--line)" } as const;
const addDays = (start: string, n: number) => { const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const WEEKENDS: Record<string, number[]> = { SATSUN: [6, 0], SUN: [0], FRISAT: [5, 6], NONE: [] };
const WEEKEND_LABEL: Record<string, string> = { SATSUN: "Saturday and Sunday", SUN: "Sunday only", FRISAT: "Friday and Saturday", NONE: "No weekend" };

export default function SemesterPlanForm({ items, roles, holidays = [] }: { items: Item[]; roles: { value: string; label: string }[]; holidays?: string[] }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [start, setStart] = useState("");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.key, true])));
  const [roleOf, setRoleOf] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.key, i.role])));
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const [weekend, setWeekend] = useState("SATSUN");
  const [calDraft, setCalDraft] = useState<Record<string, string>>({});
  const [wrkDraft, setWrkDraft] = useState<Record<string, string>>({});
  const hol = new Set(holidays);
  const isWorking = (iso: string) => !WEEKENDS[weekend].includes(new Date(iso + "T00:00:00Z").getUTCDay()) && !hol.has(iso);
  /** Working days from the start to a date: days after the start up to and including the date (negative when before). */
  function workingBetween(from: string, to: string) {
    const n = dayDiff(from, to); let c = 0;
    if (n > 0) for (let k = 1; k <= n; k++) { if (isWorking(addDays(from, k))) c++; }
    if (n < 0) for (let k = 0; k > n; k--) { if (isWorking(addDays(from, k - 1))) c--; }
    return c;
  }
  /** The date that is n working days after (or before, when negative) the start; the result is always a working day. */
  function addWorking(from: string, n: number) {
    let d = from, left = Math.abs(n); const step = n < 0 ? -1 : 1;
    if (n === 0) { let g = 0; while (!isWorking(d) && g++ < 400) d = addDays(d, 1); return d; }
    let guard = 0;
    while (left > 0 && guard++ < 4000) { d = addDays(d, step); if (isWorking(d)) left--; }
    return d;
  }
  const clearDrafts = (k: string) => { setCalDraft((x) => { const y = { ...x }; delete y[k]; return y; }); setWrkDraft((x) => { const y = { ...x }; delete y[k]; return y; }); };
  function setByCal(k: string, v: string) { setCalDraft({ ...calDraft, [k]: v }); const n = parseInt(v, 10); if (start && /^-?\d+$/.test(v.trim())) setDates({ ...dates, [k]: addDays(start, n) }); }
  function setByWrk(k: string, v: string) { setWrkDraft({ ...wrkDraft, [k]: v }); const n = parseInt(v, 10); if (start && /^-?\d+$/.test(v.trim())) setDates({ ...dates, [k]: addWorking(start, n) }); }
  const phases = Array.from(new Set(items.map((i) => i.phase)));
  function setStartDate(v: string) { setStart(v); setCalDraft({}); setWrkDraft({}); setDates(v ? Object.fromEntries(items.map((i) => [i.key, addDays(v, i.offset)])) : {}); }
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
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Enter the semester name and its start date. The dates are suggested from the usual order of work; change any date, change the role a task belongs to, or untick tasks you do not want. Type a number of days (calendar or working) and the date is worked out; pick a date and both day counts are shown. Working days skip the weekend and the holidays and breaks in your academic calendar; a minus number means before the start. Each target is for a role, whoever holds it, never for one person. Publishing the same semester again replaces its earlier plan.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>Semester<br /><input style={{ ...input, width: 170 }} placeholder="Spring 2027" value={term} onChange={(e) => setTerm(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>First day of classes<br /><input style={input} type="date" value={start} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Weekend (not working days)<br /><select style={input} value={weekend} onChange={(e) => { setWeekend(e.target.value); setWrkDraft({}); }}>{Object.keys(WEEKENDS).map((w) => <option key={w} value={w}>{WEEKEND_LABEL[w]}</option>)}</select></label>
      </div>
      {start && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th></th><th>Task</th><th>Role</th><th>Complete by</th><th title="Calendar days from the first day of classes (minus = before)">Days from start</th><th title="Working days from the first day of classes — weekends and holidays skipped">Working days</th></tr></thead>
            <tbody>{phases.map((ph) => (
              <Fragment key={ph}>
                <tr><td colSpan={6} style={{ background: "rgba(0,0,0,0.04)", fontWeight: 700 }}>{ph}</td></tr>
                {items.filter((i) => i.phase === ph).map((i) => (
                  <tr key={i.key}>
                    <td><input type="checkbox" checked={on[i.key]} onChange={(e) => setOn({ ...on, [i.key]: e.target.checked })} /></td>
                    <td><b>{i.title}</b><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{i.why}{i.scope === "COURSE" ? " · tracked per course" : i.scope === "EACH" ? " · one for each person in the role" : ""}</div></td>
                    <td><select style={input} value={roleOf[i.key]} onChange={(e) => setRoleOf({ ...roleOf, [i.key]: e.target.value })}>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></td>
                    <td><input style={input} type="date" value={dates[i.key] || ""} onChange={(e) => { setDates({ ...dates, [i.key]: e.target.value }); clearDrafts(i.key); }} />
                      {dates[i.key] && <div style={{ fontSize: 11, color: isWorking(dates[i.key]) ? "var(--slate)" : "#b3261e" }}>{new Date(dates[i.key] + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}{hol.has(dates[i.key]) ? " · holiday" : !isWorking(dates[i.key]) ? " · weekend" : ""}</div>}</td>
                    <td><input style={{ ...input, width: 72 }} type="number" value={calDraft[i.key] ?? (dates[i.key] ? String(dayDiff(start, dates[i.key])) : "")} onChange={(e) => setByCal(i.key, e.target.value)} onBlur={() => clearDrafts(i.key)} /></td>
                    <td><input style={{ ...input, width: 72 }} type="number" value={wrkDraft[i.key] ?? (dates[i.key] ? String(workingBetween(start, dates[i.key])) : "")} onChange={(e) => setByWrk(i.key, e.target.value)} onBlur={() => clearDrafts(i.key)} /></td>
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
