"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAL_COLOUR, CAL_KINDS } from "../lib/academic";

type Entry = { id: string; kind: string; title: string; startDate: string; endDate: string | null; termName: string | null; termYear: number | null; facultyId: string | null; scope: string; canDelete: boolean };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function AcademicCalendarManager({ entries, canSet, faculties, canChooseFaculty, canApply }: {
  entries: Entry[]; canSet: boolean; faculties: { id: string; name: string }[]; canChooseFaculty: boolean; canApply: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ kind: "SEMESTER_START", title: "", startDate: "", endDate: "", termName: "Fall", termYear: String(new Date().getFullYear()), facultyId: "" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const needsTerm = ["SEMESTER_START", "MIDTERM", "FINAL"].includes(f.kind);

  async function add() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/academic-calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, termName: needsTerm ? f.termName : null, termYear: needsTerm ? f.termYear : null }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false); setOk(res.ok); setMsg(res.ok ? "Added." : d.error || "Something went wrong");
    if (res.ok) { setF({ ...f, title: "", startDate: "", endDate: "" }); router.refresh(); }
  }
  async function remove(id: string) {
    if (!confirm("Remove this date from the calendar?")) return;
    const res = await fetch(`/api/academic-calendar?id=${id}`, { method: "DELETE" });
    if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); setOk(false); setMsg(d.error || "Could not remove"); }
  }
  async function apply() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/academic-calendar/apply", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false); setOk(res.ok); setMsg(res.ok ? `Copied ${d.holidays} holiday day(s) and ${d.terms} semester date set(s) into your own calendar.` : d.error || "Something went wrong");
  }
  const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;

  return (
    <>
      {msg && <div className="card" style={{ color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      {canSet && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Add a date</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ fontSize: 12 }}>Type<br /><select style={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(CAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Title<br /><input style={{ ...input, width: 220 }} value={f.title} placeholder="e.g. Fall 2026 begins" onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>From<br /><input style={input} type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>To (optional)<br /><input style={input} type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
            {needsTerm && <>
              <label style={{ fontSize: 12 }}>Term<br /><select style={input} value={f.termName} onChange={(e) => setF({ ...f, termName: e.target.value })}><option>Fall</option><option>Spring</option><option>Summer</option></select></label>
              <label style={{ fontSize: 12 }}>Year<br /><input style={{ ...input, width: 80 }} type="number" value={f.termYear} onChange={(e) => setF({ ...f, termYear: e.target.value })} /></label>
            </>}
            {canChooseFaculty && (
              <label style={{ fontSize: 12 }}>Applies to<br /><select style={input} value={f.facultyId} onChange={(e) => setF({ ...f, facultyId: e.target.value })}>
                <option value="">Whole institute</option>{faculties.map((x) => <option key={x.id} value={x.id}>{x.name} only</option>)}</select></label>
            )}
            <button className="btn" disabled={busy} onClick={add}>Add</button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Semester start, midterm and final dates need a term so Program Leads can copy them into their own semester dates.</p>
        </div>
      )}
      {canApply && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Use this calendar in your programs</b>
          <p style={{ fontSize: 12.5, color: "var(--slate)", margin: "4px 0 8px" }}>Copies the holidays and the semester, midterm and final dates below into your own Calendar & Exam Dates, so lecture dates fill in from them. You can still change them afterwards.</p>
          <button className="btn" disabled={busy} onClick={apply}>Copy into my calendar</button>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        {entries.length === 0 ? <p style={{ color: "var(--slate)" }}>No dates have been set yet.</p> : (
          <table>
            <thead><tr><th>Date</th><th>What</th><th>Type</th><th>Applies to</th><th></th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(e.startDate)}{e.endDate && e.endDate !== e.startDate ? ` – ${fmt(e.endDate)}` : ""}</td>
                  <td><b>{e.title}</b>{e.termName ? <span style={{ color: "var(--slate)", fontSize: 12 }}> · {e.termName} {e.termYear}</span> : null}</td>
                  <td><span style={{ background: CAL_COLOUR[e.kind] || "#4B5563", color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11.5 }}>{CAL_KINDS[e.kind] || e.kind}</span></td>
                  <td style={{ fontSize: 12.5 }}>{e.scope}</td>
                  <td>{e.canDelete && <button className="btn" style={{ fontSize: 12 }} onClick={() => remove(e.id)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
