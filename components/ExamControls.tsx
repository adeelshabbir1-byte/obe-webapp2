"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** New exam session form (and editing an existing one). */
export function ExamSessionForm({ initial, sessionId }: { initial: { name: string; examType: string; startDate: string; endDate: string; slots: string; offDays: number[]; maxPerDay: number; seatPercent: number; invigilatorsPerRoom: number; includeLabs: boolean }; sessionId?: string }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    const r = await fetch(sessionId ? `/api/exams/${sessionId}` : "/api/exams", { method: sessionId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, slots: f.slots.split(/[\n,]+/) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Could not save."); return; }
    if (!sessionId && d.id) router.push(`/exams/${d.id}`); else router.refresh();
  }
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div className="field"><label>Name</label><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Midterm Fall 2026" /></div>
        <div className="field"><label>Exam</label><select value={f.examType} onChange={(e) => set("examType", e.target.value)}><option>Midterm</option><option>Final</option></select></div>
        <div className="field"><label>First day</label><input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
        <div className="field"><label>Last day</label><input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>
        <div className="field"><label>Time slots (one per line)</label><textarea rows={3} value={f.slots} onChange={(e) => set("slots", e.target.value)} /></div>
        <div className="field"><label>No exams on</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>{DAYS.map((d, i) => (
            <label key={d} style={{ display: "flex", gap: 3, alignItems: "center" }}><input type="checkbox" checked={f.offDays.includes(i)} onChange={(e) => set("offDays", e.target.checked ? [...f.offDays, i] : f.offDays.filter((x) => x !== i))} />{d}</label>
          ))}</div>
          <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>Holidays and breaks in the academic calendar are skipped too.</div>
        </div>
        <div className="field"><label>Most papers per student per day</label><input type="number" min={1} max={4} value={f.maxPerDay} onChange={(e) => set("maxPerDay", Number(e.target.value))} /></div>
        <div className="field"><label>Seats used per room (%)</label><input type="number" min={10} max={100} value={f.seatPercent} onChange={(e) => set("seatPercent", Number(e.target.value))} /><div style={{ fontSize: 11, color: "var(--slate)" }}>50% = every other seat, for spacing.</div></div>
        <div className="field"><label>Invigilators per room</label><input type="number" min={1} max={4} value={f.invigilatorsPerRoom} onChange={(e) => set("invigilatorsPerRoom", Number(e.target.value))} /></div>
        <div className="field"><label>Lab courses</label><label style={{ fontSize: 12.5, display: "flex", gap: 6 }}><input type="checkbox" checked={f.includeLabs} onChange={(e) => set("includeLabs", e.target.checked)} /> Lab courses also sit a paper</label></div>
      </div>
      <button className="btn btn-brass" disabled={busy} onClick={save}>{busy ? "Saving…" : sessionId ? "Save settings" : "Create exam session"}</button>
    </div>
  );
}

/** Generate / redo rooms / publish / delete. */
export function ExamActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  async function call(url: string, body: unknown, label: string, method = "POST") {
    setBusy(label); setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { setMsg(d.error || "Something went wrong."); return null; }
    return d;
  }
  return (
    <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button className="btn btn-brass" disabled={!!busy} onClick={async () => { if (!confirm("Make the date sheet? Papers you moved by hand stay where they are; the rest are placed again, then rooms, seats and invigilators are worked out.")) return; const d = await call(`/api/exams/${id}/generate`, {}, "gen"); if (d) { setMsg(`${d.placed} paper group(s) placed${d.unplaced ? `, ${d.unplaced} could not be placed` : ""}.`); router.refresh(); } }}>{busy === "gen" ? "Working…" : "Generate date sheet"}</button>
      <button className="btn" disabled={!!busy} onClick={async () => { if (await call(`/api/exams/${id}/generate`, { mode: "rooms" }, "rooms")) router.refresh(); }}>{busy === "rooms" ? "Working…" : "Redo rooms & invigilators"}</button>
      {status === "PUBLISHED"
        ? <button className="btn" disabled={!!busy} onClick={async () => { if (await call(`/api/exams/${id}/publish`, { publish: false }, "pub")) router.refresh(); }}>Unpublish</button>
        : <button className="btn btn-brass" disabled={!!busy} onClick={async () => { if (!confirm("Publish? Students see their exams and seats; instructors and invigilators are notified.")) return; if (await call(`/api/exams/${id}/publish`, { publish: true }, "pub")) router.refresh(); }}>Publish</button>}
      <button className="act act-danger" disabled={!!busy} onClick={async () => { if (!confirm("Delete this exam session and its date sheet?")) return; if (await call(`/api/exams/${id}`, {}, "del", "DELETE")) router.push("/exams"); }}>Delete</button>
      {msg && <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{msg}</span>}
    </span>
  );
}

/** Move one paper (all its sections) to another day / slot. */
export function PaperMove({ sessionId, paperId, date, slot, days, slots }: { sessionId: string; paperId: string; date: string | null; slot: number | null; days: { iso: string; label: string }[]; slots: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const value = date && slot !== null ? `${date}|${slot}` : "";
  return (
    <span>
      <select value={value} disabled={busy} style={{ fontSize: 11.5, maxWidth: 210 }} onChange={async (e) => {
        const [d, s] = e.target.value ? e.target.value.split("|") : [null, null];
        setBusy(true); setNote("");
        const r = await fetch(`/api/exams/${sessionId}/papers/${paperId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: d, slot: s === null ? null : Number(s) }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) { setNote(j.error || "Could not move."); return; }
        if (j.clashes?.length) setNote(`Clash: ${j.clashes.join("; ")}`);
        router.refresh();
      }}>
        <option value="">— not scheduled —</option>
        {days.flatMap((d) => slots.map((s, i) => <option key={`${d.iso}|${i}`} value={`${d.iso}|${i}`}>{d.label} · {s}</option>))}
      </select>
      {note && <div style={{ fontSize: 11, color: "var(--rust)" }}>{note}</div>}
    </span>
  );
}
