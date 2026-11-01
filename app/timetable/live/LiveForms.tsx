"use client";

import { useState } from "react";

const post = (body: unknown) => fetch("/api/timetable/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const toH = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };

type Opt = { id: string; label: string };
// Reschedule / cancel / make-up / substitute one class (Adeel prompt §22.4, §23.1–2).
export function ChangeForm({ entries, rooms, teachers }: { entries: Opt[]; rooms: Opt[]; teachers: Opt[] }) {
  const [f, setF] = useState({ entryId: "", kind: "MOVE_ONCE", date: new Date().toISOString().slice(0, 10), start: "", end: "", toRoomId: "", substituteId: "", reason: "" });
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  async function save() {
    setMsg("");
    const r = await post({ action: "change", entryId: f.entryId, kind: f.kind, date: f.date, toStart: f.start ? toH(f.start) : undefined, toEnd: f.end ? toH(f.end) : undefined, toRoomId: f.toRoomId || undefined, substituteId: f.substituteId || undefined, reason: f.reason });
    setMsg(r.error || (r.status === "PENDING" ? "Sent to the Program Lead / Department Coordinator for approval." : "Saved ✓ — the students and the teacher are told."));
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, alignItems: "center" }}>
      <select value={f.entryId} onChange={(e) => set("entryId", e.target.value)} style={{ maxWidth: 260 }}><option value="">Class…</option>{entries.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
        <option value="MOVE_ONCE">Move — this date only</option><option value="MOVE_FROM">Move — permanently from this date</option><option value="CANCEL">Cancel on this date</option><option value="MAKEUP">Make-up class on this date</option><option value="SUBSTITUTE">Substitute teacher on this date</option>
      </select>
      <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
      {["MOVE_ONCE", "MOVE_FROM", "MAKEUP"].includes(f.kind) && <><input type="time" value={f.start} onChange={(e) => set("start", e.target.value)} title="Start" /><input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} title="End" />
        <select value={f.toRoomId} onChange={(e) => set("toRoomId", e.target.value)}><option value="">Same room</option>{rooms.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></>}
      {f.kind === "SUBSTITUTE" && <select value={f.substituteId} onChange={(e) => set("substituteId", e.target.value)}><option value="">Substitute…</option>{teachers.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
      <input value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Reason" style={{ width: 200 }} />
      <button type="button" className="btn btn-sm" onClick={save}>Save</button>
      {msg && <span className={msg.includes("✓") || msg.includes("Sent") ? "small-note" : ""} style={{ color: msg.includes("✓") || msg.includes("Sent") ? undefined : "#B3261E" }}>{msg}</span>}
    </div>
  );
}

// Book a free room on a date (tutorial, CQI session, meeting, extra class).
export function BookForm({ rooms, date, start, end, roomId }: { rooms: Opt[]; date?: string; start?: string; end?: string; roomId?: string }) {
  const [f, setF] = useState({ date: date || new Date().toISOString().slice(0, 10), start: start || "", end: end || "", roomId: roomId || "", title: "" });
  const [msg, setMsg] = useState("");
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, fontSize: 12.5 }}>
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /><input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
      <select value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}><option value="">Room…</option>{rooms.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What for" style={{ width: 150 }} />
      <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "book", date: f.date, start: toH(f.start), end: toH(f.end), roomId: f.roomId, title: f.title }); setMsg(r.error || "Booked ✓"); }}>Book</button>
      {msg && <span className="small-note">{msg}</span>}
    </span>
  );
}

// One row of the floor register: one tap "on time", or the actual times, room change, not held.
export function RegisterRow({ entryId, date, planned, roomId }: { entryId: string; date: string; planned: string; roomId: string }) {
  const [s, setS] = useState(planned); const [e, setE] = useState(""); const [held, setHeld] = useState(true); const [note, setNote] = useState(""); const [msg, setMsg] = useState("");
  const save = async (onTime = false) => { const r = await post({ action: "register", entryId, date, startedAt: toH(onTime ? planned : s), endedAt: e ? toH(e) : "", roomId, held, note }); setMsg(r.error || "✓"); };
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", fontSize: 12.5, alignItems: "center" }}>
      <button type="button" className="btn btn-sm" onClick={() => save(true)}>On time</button>
      started <input type="time" value={s} onChange={(x) => setS(x.target.value)} /> ended <input type="time" value={e} onChange={(x) => setE(x.target.value)} />
      <label><input type="checkbox" checked={!held} onChange={(x) => setHeld(!x.target.checked)} /> not held</label>
      <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="note / room changed to…" style={{ width: 140 }} />
      <button type="button" className="btn-link" onClick={() => save()}>Save</button> {msg}
    </span>
  );
}

export function Review({ id }: { id: string }) {
  const [reason, setReason] = useState(""); const [msg, setMsg] = useState("");
  const go = async (review: string) => { const r = await post({ action: "review", id, review, reason }); setMsg(r.error || (review === "PENALISE" ? "Penalised" : "Excused")); };
  if (msg && !msg.includes(" ")) return <span className="small-note">{msg}</span>;
  return <span style={{ display: "inline-flex", gap: 6, fontSize: 12.5 }}><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="genuine reason (for Excused)" style={{ width: 170 }} /><button type="button" className="btn btn-sm" onClick={() => go("EXCUSED")}>Excused</button><button type="button" className="btn-link" onClick={() => go("PENALISE")}>Penalise</button>{msg && <span style={{ color: "#B3261E" }}>{msg}</span>}</span>;
}
export function Approve({ id }: { id: string }) {
  const [msg, setMsg] = useState("");
  if (msg) return <span className="small-note">{msg}</span>;
  return <span><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "approve", id, approve: true }); setMsg(r.error || "Approved"); }}>Approve</button> <button type="button" className="btn-link" onClick={async () => { const r = await post({ action: "approve", id, approve: false }); setMsg(r.error || "Refused"); }}>Refuse</button></span>;
}
export function TokenButton({ kind, roomId, label }: { kind: "ICS" | "KIOSK"; roomId?: string; label?: string }) {
  const [url, setUrl] = useState("");
  if (url) return <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ width: 360, fontSize: 12 }} />;
  return <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "token", kind, roomId, label }); if (r.token) setUrl(`${location.origin}${kind === "ICS" ? `/api/timetable/ics/${r.token}` : `/kiosk/${r.token}`}`); }}>{kind === "ICS" ? "Get my calendar link (.ics)" : "Make a screen link"}</button>;
}
