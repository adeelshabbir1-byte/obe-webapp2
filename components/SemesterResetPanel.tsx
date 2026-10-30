"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = { scope: string; terms: string[]; confirmWord: string; counts: Record<string, number>; refused: string | null };
type Reset = { id: string; label: string; createdAt: string; expiresAt: string; restoredAt: string | null; counts: Record<string, number>; canRestore: boolean };
const LABEL: Record<string, string> = { offeredCourses: "offered courses", sections: "timetable sections", timetableEntries: "timetable entries", registrations: "registrations", attendance: "attendance records", marks: "marks entered this term" };

// "Reset this semester's offering": shows exactly what will be lost, asks for the term name, keeps a 7-day restore.
export default function SemesterResetPanel() {
  const router = useRouter();
  const [d, setD] = useState<{ preview: Preview; resets: Reset[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch("/api/coordinator/semester-reset").then((r) => r.json()).then(setD).catch(() => null), []);
  useEffect(() => { load(); }, [load]);
  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/coordinator/semester-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const x = await r.json().catch(() => ({}));
    setBusy(false); setMsg(r.ok ? { ok: true, t: done } : { ok: false, t: x.error || "Failed." });
    if (r.ok) { setOpen(false); setWord(""); load(); router.refresh(); }
  };
  if (!d) return null;
  const p = d.preview;
  return (
    <div className="card" style={{ borderLeft: "4px solid #B3261E" }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Reset this semester&apos;s offering</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Un-offers this term&apos;s courses and removes their sections, timetable, registrations, attendance and marks. Plans, CLOs and earlier terms stay. Everything removed can be restored for 7 days.</p>
      {msg && <div className={msg.ok ? "small-note" : "err"} role="status">{msg.t}</div>}
      {p.refused ? <div className="err">{p.refused}</div> : !open ? (
        <button className="btn btn-sm" style={{ background: "#B3261E" }} disabled={!p.counts.offeredCourses} onClick={() => setOpen(true)}>Reset this semester&apos;s offering</button>
      ) : (
        <div role="alertdialog" aria-label="Confirm the reset">
          <p style={{ fontSize: 13.5, margin: "6px 0" }}><b>Do you want to lose this semester&apos;s data?</b> {p.terms.length ? `(${p.terms.join(", ")})` : ""} This removes:</p>
          <ul style={{ fontSize: 13, margin: "4px 0 8px" }}>{Object.entries(p.counts).map(([k, v]) => <li key={k}><b>{v}</b> {LABEL[k] || k}</li>)}</ul>
          <label style={{ fontSize: 13 }}>Type <b>{p.confirmWord}</b> to confirm: <input value={word} onChange={(e) => setWord(e.target.value)} aria-label="Type the term name to confirm" /></label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-sm" style={{ background: "#B3261E" }} disabled={busy || word.trim().toLowerCase() !== p.confirmWord.toLowerCase()} onClick={() => post({ confirm: word }, "The offering was reset. You can restore it below for 7 days.")}>{busy ? "Resetting…" : "Yes, reset it"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setWord(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {d.resets.length > 0 && <div style={{ marginTop: 12 }}>
        <b style={{ fontSize: 13 }}>Earlier resets</b>
        {d.resets.map((r) => (
          <div key={r.id} style={{ fontSize: 12.5, padding: "4px 0", borderTop: "1px solid var(--line)" }}>
            {new Date(r.createdAt).toLocaleString()} — {r.label} · {r.counts.offeredCourses} course(s), {r.counts.registrations} registration(s), {r.counts.marks} mark(s)
            {r.restoredAt ? <span className="small-note"> · restored {new Date(r.restoredAt).toLocaleDateString()}</span> : r.canRestore ? <> · <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => post({ restore: r.id }, "Restored: the courses are offered again with their data.")}>Restore (until {new Date(r.expiresAt).toLocaleDateString()})</button></> : <span className="small-note"> · restore window passed</span>}
          </div>
        ))}
      </div>}
    </div>
  );
}
