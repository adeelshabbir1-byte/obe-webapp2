"use client";

import { useState } from "react";

type Res = { day: string; notes: { kind: string; text: string }[]; timetable: boolean; busy: { batch: string; classes: string[] }[]; free: string[] };

/** For office holders: before choosing a date and time, see holidays, exams, national days, other events and which batches have class. */
export default function SocietyDateCheck() {
  const [date, setDate] = useState(""); const [start, setStart] = useState("14:00"); const [end, setEnd] = useState("16:00");
  const [res, setRes] = useState<Res | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/student/society-plan?date=${date}&start=${start}&end=${end}`);
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Could not check."); setRes(null); return; }
    setRes(d);
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12 }}>Date<br /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>From<br /><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>To<br /><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!date || busy} onClick={check}>{busy ? "Checking…" : "Check this slot"}</button>
      </div>
      {err && <p className="small-note" style={{ color: "var(--rust)" }}>{err}</p>}
      {res && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          {res.notes.length ? <div className="err" style={{ background: "#FFF1F0" }}><b>On {res.day} {date}:</b> {res.notes.map((n) => `${n.kind}: ${n.text}`).join(" · ")}</div> : <p style={{ color: "#23894f", margin: "4px 0" }}>No holiday, exam or other event that day.</p>}
          {!res.timetable ? <p className="small-note">No timetable has been published yet, so class times can&apos;t be checked.</p> : <>
            <p style={{ margin: "4px 0" }}><b style={{ color: "#23894f" }}>Free {start}–{end}:</b> {res.free.length ? res.free.join(", ") : "no batch"}</p>
            {res.busy.length > 0 && <div><b style={{ color: "#c98a0b" }}>Have class then</b> (ask the Program Lead in advance if they should attend):<ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{res.busy.map((b) => <li key={b.batch}>{b.batch}: {b.classes.join(", ")}</li>)}</ul></div>}
          </>}
        </div>
      )}
    </div>
  );
}
