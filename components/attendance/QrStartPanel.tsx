"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Lecture = { id: string; label: string; held: boolean };
type Recent = { id: string; lecture: string; startedAt: string; status: string; present: number; late: number; absent: number };

/** Start a live QR attendance session for a lecture, or go back to one that is running. */
export default function QrStartPanel({ courseId, lectures, defaults, openId, recent }: {
  courseId: string; lectures: Lecture[]; openId: string | null; recent: Recent[];
  defaults: { presentMinutes: number; lateMinutes: number; rotateSeconds: number };
}) {
  const router = useRouter();
  const first = lectures.find((l) => !l.held) || lectures[lectures.length - 1];
  const [lectureRowId, setLecture] = useState(first?.id || "");
  const [presentMinutes, setPresent] = useState(defaults.presentMinutes);
  const [lateMinutes, setLate] = useState(defaults.lateMinutes);
  const [requireLogin, setRequireLogin] = useState(true);
  const [sameNetwork, setSameNetwork] = useState(false);
  const [checkLocation, setCheckLocation] = useState(false);
  const [radiusM, setRadius] = useState(150);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const position = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });

  async function start() {
    setBusy(true); setErr("");
    const where = checkLocation ? await position() : null;
    if (checkLocation && !where) { setBusy(false); setErr("Your browser didn't share your location. Allow it, or untick the location check."); return; }
    const r = await fetch("/api/attendance/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, lectureRowId, presentMinutes, lateMinutes, rotateSeconds: defaults.rotateSeconds, requireLogin, sameNetwork, checkLocation, radiusM, ...(where || {}) }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (r && r.status === 409 && d.openId) { router.push(`/instructor/attendance/live/${d.openId}`); return; }
    if (!r || !r.ok) { setBusy(false); setErr(d.error || "Couldn't start the session."); return; }
    router.push(`/instructor/attendance/live/${d.id}`);
  }

  const num = (v: number, set: (n: number) => void, min: number, max: number, label: string) => (
    <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{label}
      <input type="number" min={min} max={max} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 90, padding: "5px 8px" }} />
    </label>
  );

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>QR attendance</h3>
        {openId && <Link href={`/instructor/attendance/live/${openId}`} className="btn btn-brass btn-sm">A session is running — open it</Link>}
      </div>
      <p style={{ fontSize: 12, color: "var(--slate)", margin: "4px 0 12px" }}>
        Show a QR code on the classroom screen. It changes every {defaults.rotateSeconds} seconds, so a photo sent to someone outside is useless. Students scan it with their phone camera; you see them arrive live and can mark anyone by hand.
      </p>
      {lectures.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--slate)", margin: 0 }}>No lectures in your plan yet — add them on the Lecture Log tab first.</p> : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Lecture
              <select value={lectureRowId} onChange={(e) => setLecture(e.target.value)} style={{ padding: "6px 8px", minWidth: 280, maxWidth: "100%" }}>
                {lectures.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
            {num(presentMinutes, setPresent, 1, 90, "Present for the first (min)")}
            {num(lateMinutes, setLate, presentMinutes, 180, "Late until, then closed (min)")}
          </div>
          <div style={{ display: "grid", gap: 6, margin: "12px 0", fontSize: 13 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={requireLogin} onChange={(e) => setRequireLogin(e.target.checked)} /> Students sign in (roll number and portal password) — untick to accept the roll number alone</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={sameNetwork} onChange={(e) => setSameNetwork(e.target.checked)} /> Only from the network I&apos;m on now (the classroom Wi-Fi)</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><input type="checkbox" checked={checkLocation} onChange={(e) => setCheckLocation(e.target.checked)} /> Only within
              <input type="number" min={30} max={2000} value={radiusM} onChange={(e) => setRadius(Number(e.target.value))} disabled={!checkLocation} style={{ width: 80, padding: "3px 6px" }} aria-label="Distance in metres" /> m of where I am (uses the phone&apos;s location)</label>
          </div>
          {err && <div className="err">{err}</div>}
          <button type="button" className="btn btn-brass" onClick={start} disabled={busy || !lectureRowId || lateMinutes < presentMinutes}>{busy ? "Starting…" : "Start QR attendance"}</button>
        </>
      )}
      {recent.length > 0 && (
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <div className="small-note" style={{ marginBottom: 4 }}>Recent sessions</div>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Lecture</th><th>Started</th><th>Present</th><th>Late</th><th>Absent</th><th></th></tr></thead>
            <tbody>{recent.map((r) => (
              <tr key={r.id}><td>{r.lecture}</td><td>{new Date(r.startedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td><Link href={`/instructor/attendance/live/${r.id}`}>{r.status === "OPEN" ? "Open (live)" : "Review"}</Link></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
