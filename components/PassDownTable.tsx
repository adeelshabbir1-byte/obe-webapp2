"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Passing the Institute Head's targets down with my own earlier dates. A default slack (working or calendar days) on top
// applies to every row; each row's slack and date are editable and linked (slack ⇄ date), and moving a task later
// pushes the later tasks of the same role so the order of the work holds.
export type PassRow = { id: string; title: string; role: string; roleLabel: string; parentDate: string; current: string; order: number };

const addDays = (iso: string, n: number, working: boolean, off: Set<string>) => {
  const d = new Date(`${iso}T00:00:00Z`); let left = Math.abs(n); const step = n < 0 ? -1 : 1;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + step); const k = d.toISOString().slice(0, 10); const wd = d.getUTCDay(); if (!working || (wd !== 0 && wd !== 6 && !off.has(k))) left--; }
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string, working: boolean, off: Set<string>) => { // b - a
  if (!a || !b) return 0;
  let n = 0; const s = new Date(`${a}T00:00:00Z`), e = new Date(`${b}T00:00:00Z`); const step = s <= e ? 1 : -1;
  for (const d = new Date(s); step > 0 ? d < e : d > e; d.setUTCDate(d.getUTCDate() + step)) { const wd = d.getUTCDay(), k = d.toISOString().slice(0, 10); if (!working || (wd !== 0 && wd !== 6 && !off.has(k))) n += step; }
  return n;
};

export default function PassDownTable({ rows, holidays }: { rows: PassRow[]; holidays: string[] }) {
  const router = useRouter();
  const off = useMemo(() => new Set(holidays), [holidays]);
  const [working, setWorking] = useState(true);
  const [def, setDef] = useState(5);
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.current || addDays(r.parentDate, -5, true, new Set(holidays))])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const sorted = useMemo(() => rows.slice().sort((a, b) => a.roleLabel.localeCompare(b.roleLabel) || a.order - b.order || a.parentDate.localeCompare(b.parentDate)), [rows]);

  const setDate = (id: string, v: string) => setDates((prev) => {
    const next = { ...prev, [id]: v };
    const me = sorted.find((r) => r.id === id)!;
    // Keep the order of the work: a later task of the same role is never before this one.
    for (const r of sorted) if (r.role === me.role && r.order > me.order && next[r.id] < v) next[r.id] = v > r.parentDate ? r.parentDate : v;
    return next;
  });
  const applyDefault = () => setDates(Object.fromEntries(rows.map((r) => [r.id, addDays(r.parentDate, -def, working, off)])));

  async function saveAll() {
    setBusy(true); setMsg("");
    let ok = 0; const errs: string[] = [];
    for (const r of sorted) {
      if (dates[r.id] === r.current) continue;
      const res = await fetch("/api/semester-plan/pass", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId: r.id, dueDate: dates[r.id] }) });
      if (res.ok) ok++; else errs.push(`${r.title}: ${(await res.json().catch(() => ({}))).error || "failed"}`);
    }
    setBusy(false); setMsg(`${ok} date(s) passed on.${errs.length ? ` ${errs.join("; ")}` : ""}`);
    router.refresh();
  }

  let lastRole = "";
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <b>My dates for my area</b>
        <span className="small-note" style={{ margin: 0 }}>Default slack</span>
        <input type="number" min={0} max={60} value={def} onChange={(e) => setDef(Math.max(0, Number(e.target.value) || 0))} style={{ width: 60 }} aria-label="Default slack days" />
        <select value={working ? "w" : "c"} onChange={(e) => setWorking(e.target.value === "w")} aria-label="Working or calendar days"><option value="w">working days</option><option value="c">calendar days</option></select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={applyDefault}>Apply to every row</button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={saveAll} style={{ marginLeft: "auto" }}>{busy ? "Saving…" : "Pass on all changed dates"}</button>
      </div>
      {msg && <p className="small-note">{msg}</p>}
      <table style={{ fontSize: 12.5, width: "100%" }}>
        <thead><tr><th>Task</th><th>Final date (above you)</th><th>Slack ({working ? "working" : "calendar"} days)</th><th>My date</th><th /></tr></thead>
        <tbody>{sorted.map((r) => {
          const head = r.roleLabel !== lastRole; lastRole = r.roleLabel;
          const slack = daysBetween(dates[r.id], r.parentDate, working, off);
          return [
            head ? <tr key={`h-${r.role}`}><td colSpan={5} style={{ background: "#F3F5F8", fontWeight: 700, fontSize: 12 }}>{r.roleLabel}</td></tr> : null,
            <tr key={r.id}>
              <td><b>{r.title}</b></td><td>{r.parentDate}</td>
              <td><input type="number" min={0} max={90} value={slack} onChange={(e) => setDate(r.id, addDays(r.parentDate, -Math.max(0, Number(e.target.value) || 0), working, off))} style={{ width: 64, borderColor: slack < 3 ? "#B26A00" : undefined }} aria-label={`Slack for ${r.title}`} /></td>
              <td><input type="date" value={dates[r.id]} max={r.parentDate} onChange={(e) => setDate(r.id, e.target.value)} aria-label={`My date for ${r.title}`} /></td>
              <td className="small-note">{r.current ? (dates[r.id] === r.current ? "passed on" : "changed — not saved") : "not passed on yet"}</td>
            </tr>,
          ];
        })}</tbody>
      </table>
    </div>
  );
}
