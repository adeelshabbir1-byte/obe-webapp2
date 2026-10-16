"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QrCode from "./QrCode";

type Row = { studentId: string; name: string; rollNumber: string; status: string; method: string | null; at: string | null; note: string | null; distanceM: number | null; duplicateAttempts: number };
type Live = {
  session: { id: string; status: string; startedAt: string; closesAt: string; closedAt: string | null; presentMinutes: number; lateMinutes: number; rotateSeconds: number; requireLogin: boolean; sameNetwork: boolean; checkLocation: boolean; radiusM: number; absentMarked: number };
  course: { code: string; title: string } | null; lecture: { lectureNumber: number; topic: string } | null;
  phase: "PRESENT" | "LATE" | "CLOSED"; now: number; token: string | null; tokenExpiresInMs: number | null; phaseEndsInMs: number | null;
  roster: Row[]; counts: Record<string, number>;
};
const LABEL: Record<string, string> = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", LEAVE: "Excused", WAITING: "Not yet" };
const CHIP: Record<string, string> = { PRESENT: "badge-ok", LATE: "badge-neutral", ABSENT: "badge-no", LEAVE: "badge-neutral", WAITING: "" };
const HOW: Record<string, string> = { QR: "Scanned", ROLL: "Scanned (roll no.)", MANUAL: "By you", AUTO_ABSENT: "Didn't scan", EARLIER: "Marked earlier" };
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** The instructor's live attendance screen: the rotating code for the room, and the roster as students arrive. */
export default function QrLiveDashboard({ sessionId, backHref }: { sessionId: string; backHref: string }) {
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "WAITING" | "IN">("ALL");
  const [q, setQ] = useState("");
  const [projector, setProjector] = useState(false);
  const [tick, setTick] = useState(0);
  const got = useRef<{ at: number; live: Live } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const big = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const r = await fetch(`/api/attendance/sessions/${sessionId}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't load the session.");
      got.current = { at: Date.now(), live: d };
      setLive(d); setErr("");
      // Ask again just after the code changes, and at least every 3 seconds for new arrivals.
      const next = d.session.status === "OPEN" ? Math.min(3000, Math.max(250, (d.tokenExpiresInMs ?? 3000) + 80)) : 15000;
      timer.current = setTimeout(load, next);
    } catch (e) {
      setErr((e as Error).message + " Retrying…");
      timer.current = setTimeout(load, 3000);
    }
  }, [sessionId]);
  useEffect(() => { load(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 500); return () => clearInterval(t); }, []);

  const since = got.current ? Date.now() - got.current.at : 0;
  void tick;
  const phaseLeft = live?.phaseEndsInMs !== null && live?.phaseEndsInMs !== undefined ? live.phaseEndsInMs - since : null;
  const codeLeft = live?.tokenExpiresInMs !== null && live?.tokenExpiresInMs !== undefined ? live.tokenExpiresInMs - since : null;
  const url = useMemo(() => (live?.token && typeof window !== "undefined" ? `${window.location.origin}/attend?t=${live.token}` : ""), [live?.token]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch(`/api/attendance/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setErr(d.error || "That didn't work."); return; }
    load();
  }
  function mark(row: Row, status: string) {
    if (!status || status === row.status) return;
    const note = status === "ABSENT" ? null : window.prompt(`Note for ${row.name} (optional, e.g. "phone battery dead"):`, row.note || "");
    if (note === null && status !== "ABSENT") return;
    act({ action: "mark", studentId: row.studentId, status, note: note || undefined });
  }
  async function toggleProjector() {
    const next = !projector;
    setProjector(next);
    try { if (next) await big.current?.requestFullscreen?.(); else if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* not allowed: the overlay still fills the window */ }
  }
  useEffect(() => { const f = () => { if (!document.fullscreenElement) setProjector(false); }; document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);

  if (!live) return <div className="card"><p className="small-note" style={{ margin: 0 }}>{err || "Starting…"}</p></div>;
  const s = live.session, open = s.status === "OPEN" && live.phase !== "CLOSED";
  const inClass = (live.counts.PRESENT || 0) + (live.counts.LATE || 0);
  const rows = live.roster.filter((r) => (filter === "ALL" ? true : filter === "WAITING" ? r.status === "WAITING" : r.status === "PRESENT" || r.status === "LATE"))
    .filter((r) => !q.trim() || `${r.name} ${r.rollNumber}`.toLowerCase().includes(q.trim().toLowerCase()));
  const phaseText = live.phase === "PRESENT" ? "Counting as present" : live.phase === "LATE" ? "Counting as late" : "Closed";

  const qrBlock = (size: number | string, big = false) => (
    <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
      {open && url ? <QrCode value={url} size={size} label={`Attendance code for ${live.course?.code}`} /> : <div style={{ width: typeof size === "number" ? size : "60vmin", aspectRatio: "1", display: "grid", placeItems: "center", background: "#F4EFEE", borderRadius: 12, color: "var(--slate)", fontWeight: 700 }}>Attendance closed</div>}
      {open && <div style={{ fontSize: big ? "clamp(14px, 1.8vw, 20px)" : 12.5, color: "var(--slate)" }}>New code in {mmss(codeLeft ?? 0)} · scan with your phone camera</div>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{live.course?.code} — {live.course?.title}</h2>
            <div className="small-note">Lecture {live.lecture?.lectureNumber}: {live.lecture?.topic} · started {clock(s.startedAt)}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {open && <button type="button" className="btn btn-secondary btn-sm" onClick={toggleProjector}>Projector view</button>}
            {open && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act({ action: "extend", minutes: 5 })}>+5 minutes</button>}
            {open && <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => { if (window.confirm(`Close attendance now? ${live.counts.WAITING || 0} student(s) who haven't checked in will be marked absent. You can still change anyone afterwards.`)) act({ action: "close" }); }}>Close attendance</button>}
            <Link href={backHref} className="btn btn-secondary btn-sm">Back to attendance</Link>
          </div>
        </div>
      </div>
      {err && <div className="err" role="alert">{err}</div>}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }}>
        <div className="card" style={{ margin: 0, display: "grid", gap: 12, justifyItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <span className={`badge ${live.phase === "PRESENT" ? "badge-ok" : live.phase === "LATE" ? "badge-neutral" : "badge-no"}`} style={{ fontSize: 13 }}>{phaseText}</span>
            {phaseLeft !== null && open && <span style={{ fontSize: 13 }}>{live.phase === "PRESENT" ? "late in" : "closes in"} <b>{mmss(phaseLeft)}</b></span>}
          </div>
          {qrBlock(360)}
          <div className="small-note" style={{ textAlign: "center" }}>
            Present for the first {s.presentMinutes} min, late until {s.lateMinutes} min{s.requireLogin ? " · students sign in" : " · roll number only"}{s.sameNetwork ? " · classroom network only" : ""}{s.checkLocation ? ` · within ${s.radiusM} m` : ""}
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
            {(["PRESENT", "LATE", "LEAVE", "ABSENT", "WAITING"] as const).map((k) => (
              <div key={k} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{live.counts[k] || 0}</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>{LABEL[k]}</div>
              </div>
            ))}
          </div>
          <div className="small-note" style={{ marginBottom: 8 }} aria-live="polite">{inClass} of {live.roster.length} in class{!open && s.absentMarked ? ` · ${s.absentMarked} marked absent when it closed` : ""}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {(["ALL", "WAITING", "IN"] as const).map((f) => <button key={f} type="button" className={`btn btn-sm ${filter === f ? "btn-brass" : "btn-secondary"}`} onClick={() => setFilter(f)}>{f === "ALL" ? "Everyone" : f === "WAITING" ? `Not yet (${live.counts.WAITING || 0})` : `In class (${inClass})`}</button>)}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student" aria-label="Find a student" style={{ padding: "4px 8px", flex: "1 1 140px", minWidth: 0 }} />
          </div>
          <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Roll #</th><th>Name</th><th>Status</th><th>When / how</th><th>Change</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.studentId}>
                  <td>{r.rollNumber}</td>
                  <td>{r.name}{r.duplicateAttempts > 0 && <div className="small-note" style={{ color: "var(--rust)" }}>Tried again from another phone ×{r.duplicateAttempts}</div>}</td>
                  <td><span className={`badge ${CHIP[r.status] || ""}`}>{LABEL[r.status] || r.status}</span></td>
                  <td className="small-note">{r.at ? clock(r.at) : ""}{r.method ? ` · ${HOW[r.method] || r.method}` : ""}{r.distanceM !== null ? ` · ${r.distanceM} m` : ""}{r.note ? ` · “${r.note}”` : ""}</td>
                  <td>
                    <select value="" onChange={(e) => mark(r, e.target.value)} disabled={busy} aria-label={`Change ${r.name}'s attendance`} style={{ padding: "3px 6px", fontSize: 12 }}>
                      <option value="">Mark…</option>
                      {(["PRESENT", "LATE", "LEAVE", "ABSENT"] as const).map((st) => <option key={st} value={st} disabled={st === r.status}>{LABEL[st]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length === 0 && <p className="small-note" style={{ margin: "8px 0 0" }}>Nobody here.</p>}
          </div>
        </div>
      </div>

      {projector && createPortal(
        <div ref={big} role="dialog" aria-label="Projector view" style={{ position: "fixed", inset: 0, zIndex: 90, background: "#fff", display: "grid", placeItems: "center", padding: 24 }} onClick={toggleProjector}>
          <div style={{ display: "grid", justifyItems: "center", gap: 14, textAlign: "center" }}>
            <div style={{ fontSize: "clamp(18px, 3vw, 34px)", fontWeight: 800 }}>{live.course?.code} attendance — scan with your phone camera</div>
            {qrBlock("min(72vh, 82vw)", true)}
            <div style={{ fontSize: "clamp(14px, 2vw, 22px)" }}>{phaseText}{phaseLeft !== null && open ? ` · ${live.phase === "PRESENT" ? "late in" : "closes in"} ${mmss(phaseLeft)}` : ""} · {inClass} of {live.roster.length} in class</div>
            <div className="small-note">Click anywhere to leave the projector view</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
