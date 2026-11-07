"use client";
import { useState } from "react";
import type { Extra } from "../lib/examsExtra";

// Queue item 17: the Controller's set-up for one exam session, and actions on the day.
const call = (id: string, b: unknown) => fetch(`/api/exams/${id}/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
type P = { id: string; name: string };

export function ExamSetupForm({ sessionId, extra, rooms, people }: { sessionId: string; extra: Extra; rooms: { id: string; name: string; capacity: number }[]; people: P[] }) {
  const [e, setE] = useState<Extra>({ ...extra, rooms: extra.rooms || {}, extraRooms: extra.extraRooms || [], reduced: extra.reduced || {}, official: extra.official || {} });
  const [m, setM] = useState(""); const [who, setWho] = useState(people[0]?.id || "");
  const [q, setQ] = useState("0"); const [why, setWhy] = useState(""); const [dates, setDates] = useState("");
  const room = (id: string, k: string, v: unknown) => setE({ ...e, rooms: { ...e.rooms, [id]: { ...(e.rooms![id] || {}), [k]: v } } });
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const n = (label: string, k: keyof Extra, help?: string) => <label style={{ fontSize: 12.5 }}>{label}<br /><input type="number" min={0} value={String((e[k] as number) ?? "")} onChange={(x) => setE({ ...e, [k]: num(x.target.value) })} style={{ width: 90 }} />{help && <span className="small-note"> {help}</span>}</label>;
  return <div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Rules</h3>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5 }}>Paper length (min): Midterm <input type="number" value={e.durations?.Midterm ?? ""} onChange={(x) => setE({ ...e, durations: { ...e.durations, Midterm: num(x.target.value) } })} style={{ width: 70 }} /> Final <input type="number" value={e.durations?.Final ?? ""} onChange={(x) => setE({ ...e, durations: { ...e.durations, Final: num(x.target.value) } })} style={{ width: 70 }} /></label>
        {n("One invigilator per N students", "perStudents", "0 = the fixed number in Settings")}
        {n("One reserve per N rooms", "reservePerRooms", "0 = none")}
        {n("Allowance per duty", "rate")}
        {n("Report before the paper (min)", "reportMinutes")}
        {n("Other costs of the session (centres, examiners)", "otherCosts")}
        <label style={{ fontSize: 12.5 }}>Cost shares between partner universities (joint degrees)<br /><input defaultValue={(e.costShares || []).map((x) => `${x.name} ${x.pct}`).join(", ")} onBlur={(x) => setE({ ...e, costShares: x.target.value.split(",").map((t) => { const m = /^(.*?)\s+(\d+(?:\.\d+)?)%?$/.exec(t.trim()); return m ? { name: m[1].trim(), pct: Number(m[2]) } : null; }).filter((y): y is { name: string; pct: number } => !!y) })} placeholder="University A 60, University B 40" style={{ width: 260 }} /></label>
        <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={!!e.superintendent} onChange={(x) => setE({ ...e, superintendent: x.target.checked })} /> A superintendent per slot</label>
        <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={!!e.allowCoreCore} onChange={(x) => setE({ ...e, allowCoreCore: x.target.checked })} /> Allow two core papers on one day (different slots) — Controller&apos;s approval</label>
      </div>
      <p className="small-note">Always kept: one paper per batch per day; a student with a course taken with another batch gets a second paper that day only if unavoidable, and never in the same slot; GE + core on one day is fine, core + core only when allowed above. The generator lists any rule it had to bend.</p></div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Exam rooms</h3>
      <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Use</th><th>Room</th><th>Lecture seats</th><th>Rows</th><th>Seats per row</th><th>Blocked seats</th><th>Exam seats</th></tr></thead>
        <tbody>{rooms.map((r) => { const o = e.rooms![r.id] || {}; const seats = o.rows && o.cols ? o.rows * o.cols - (o.blocked || 0) : null; return <tr key={r.id}><td><input type="checkbox" checked={o.use !== false} onChange={(x) => room(r.id, "use", x.target.checked)} aria-label={`Use ${r.name}`} /></td><td>{r.name}</td><td>{r.capacity}</td>
          {(["rows", "cols", "blocked"] as const).map((k) => <td key={k}><input type="number" min={0} value={o[k] ?? ""} onChange={(x) => room(r.id, k, num(x.target.value))} style={{ width: 60 }} aria-label={`${k} ${r.name}`} /></td>)}<td>{seats ?? "share of lecture seats"}</td></tr>; })}
          {e.extraRooms!.map((r, i) => <tr key={r.id}><td><button type="button" className="btn-link" onClick={() => setE({ ...e, extraRooms: e.extraRooms!.filter((_, j) => j !== i) })}>remove</button></td><td><input value={r.name} onChange={(x) => setE({ ...e, extraRooms: e.extraRooms!.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)) })} /></td><td>exam only</td>
            {(["rows", "cols", "blocked"] as const).map((k) => <td key={k}><input type="number" min={0} value={r[k]} onChange={(x) => setE({ ...e, extraRooms: e.extraRooms!.map((y, j) => (j === i ? { ...y, [k]: num(x.target.value) } : y)) })} style={{ width: 60 }} /></td>)}<td>{r.rows * r.cols - (r.blocked || 0)}</td></tr>)}</tbody></table>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setE({ ...e, extraRooms: [...e.extraRooms!, { id: `X-${Date.now().toString(36)}`, name: "Exam hall", rows: 10, cols: 8, blocked: 0 }] })}>Add an exam-only room</button></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Reduced load and official work</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", fontSize: 12.5 }}>
        <label>Person<br /><select value={who} onChange={(x) => setWho(x.target.value)}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Duties at most<br /><input type="number" min={0} value={q} onChange={(x) => setQ(x.target.value)} style={{ width: 60 }} /></label>
        <label>Reason<br /><input value={why} onChange={(x) => setWhy(x.target.value)} placeholder="HOD, medical, official work…" /></label>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setE({ ...e, reduced: { ...e.reduced, [who]: { quota: num(q), reason: why } } })}>Set reduced load</button>
        <label>Official-work dates (YYYY-MM-DD, comma separated)<br /><input value={dates} onChange={(x) => setDates(x.target.value)} style={{ width: 220 }} /></label>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setE({ ...e, official: { ...e.official, [who]: { dates: dates.split(/[,\s]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), reason: why } } })}>No duty on these days</button></div>
      <ul style={{ fontSize: 12.5, margin: "6px 0 0 18px" }}>
        {Object.entries(e.reduced!).map(([u, v]) => <li key={`r${u}`}>{people.find((p) => p.id === u)?.name}: at most {v.quota} duties — {v.reason} <button type="button" className="btn-link" onClick={() => { const r = { ...e.reduced }; delete r[u]; setE({ ...e, reduced: r }); }}>remove</button></li>)}
        {Object.entries(e.official!).map(([u, v]) => <li key={`o${u}`}>{people.find((p) => p.id === u)?.name}: official work on {v.dates.join(", ")} — {v.reason} <button type="button" className="btn-link" onClick={() => { const r = { ...e.official }; delete r[u]; setE({ ...e, official: r }); }}>remove</button></li>)}</ul>
      <p className="small-note">Approved leave and a teacher&apos;s own timetabled class block a duty automatically.</p></div>
    <button type="button" className="btn" onClick={async () => { const r = await call(sessionId, { action: "extra", extra: e }); setM(r.error || "Saved ✓ — generate the date sheet again to apply."); }}>Save set-up</button> <span className="small-note">{m}</span>
  </div>;
}

export function ReplaceDuty({ sessionId, people, slots }: { sessionId: string; people: P[]; slots: string[] }) {
  const [f, setF] = useState({ slotKey: slots[0] || "", roomId: "", fromId: people[0]?.id || "", toId: people[1]?.id || "" }); const [m, setM] = useState("");
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12.5, alignItems: "end" }}>
    <label>Slot<br /><select value={f.slotKey} onChange={(x) => setF({ ...f, slotKey: x.target.value })}>{slots.map((s) => <option key={s}>{s}</option>)}</select></label>
    <label>Room id<br /><input value={f.roomId} onChange={(x) => setF({ ...f, roomId: x.target.value })} placeholder="from the Rooms tab" /></label>
    <label>From<br /><select value={f.fromId} onChange={(x) => setF({ ...f, fromId: x.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>To<br /><select value={f.toId} onChange={(x) => setF({ ...f, toId: x.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await call(sessionId, { action: "replace", ...f }); setM(r.error || "Replaced ✓ — both told"); }}>Replace</button><span className="small-note">{m}</span></div>;
}

/** On a duty: check in, record the chain of custody, report unfair means. */
export function DutyDay({ sessionId, slotKey, roomId }: { sessionId: string; slotKey: string; roomId: string }) {
  const [m, setM] = useState(""); const [c, setC] = useState({ packet: "", booklets: "", returned: "" }); const [u, setU] = useState({ roll: "", what: "" }); const [open, setOpen] = useState("");
  const go = async (b: Record<string, unknown>) => { const r = await call(sessionId, { slotKey, roomId, ...b }); setM(r.error || "Recorded ✓"); };
  return <div style={{ fontSize: 12.5 }}>
    <button type="button" className="btn btn-sm" onClick={() => go({ action: "checkin" })}>Check in</button>{" "}
    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(open === "c" ? "" : "c")}>Chain of custody</button>{" "}
    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(open === "u" ? "" : "u")}>Unfair means</button> <span className="small-note">{m}</span>
    {open === "c" && <div style={{ marginTop: 4 }}><input placeholder="Packet received (seal no.)" value={c.packet} onChange={(x) => setC({ ...c, packet: x.target.value })} /> <input placeholder="Booklets issued" value={c.booklets} onChange={(x) => setC({ ...c, booklets: x.target.value })} style={{ width: 110 }} /> <input placeholder="Scripts handed back" value={c.returned} onChange={(x) => setC({ ...c, returned: x.target.value })} style={{ width: 130 }} /> <button type="button" className="btn btn-sm" onClick={() => go({ action: "custody", ...c })}>Sign</button></div>}
    {open === "u" && <div style={{ marginTop: 4 }}><input placeholder="Student roll no." value={u.roll} onChange={(x) => setU({ ...u, roll: x.target.value })} style={{ width: 130 }} /> <input placeholder="What happened, evidence kept" value={u.what} onChange={(x) => setU({ ...u, what: x.target.value })} style={{ width: 300 }} /> <button type="button" className="btn btn-sm" onClick={() => go({ action: "ufm", ...u })}>Report</button></div>}
  </div>;
}
