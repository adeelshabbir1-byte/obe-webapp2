"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type CourseAtt = {
  courseId: string; code: string; title: string; instructor: string; present: number; late: number; absent: number; excused: number; marked: number;
  pct: number | null; standing: "OK" | "AT_RISK" | "SHORT" | "CANNOT_RECOVER" | "NONE"; label: string; best: number | null; canMiss: number | null; remaining: number;
};
type Data = { minPct: number; warnMarginPct: number; lateCountsPresent: boolean; excusedExcluded: boolean; courses: CourseAtt[] };
const COLOR: Record<string, string> = { OK: "var(--sage)", AT_RISK: "#B26A00", SHORT: "var(--rust)", CANNOT_RECOVER: "var(--rust)", NONE: "var(--slate)" };
const STATUS: Record<string, string> = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", LEAVE: "Excused" };

/** A student's attendance in each course, against the institute's minimum. */
export default function StudentAttendance() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<{ lectureNumber: number; topic: string; date: string | null; status: string }[]>([]);
  useEffect(() => { fetch("/api/student/attendance").then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch(() => setErr("Couldn't load your attendance.")); }, []);
  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setHistory([]);
    const d = await fetch(`/api/student/attendance?courseId=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => null);
    setHistory(d?.history || []);
  }
  if (err) return <div className="err">{err}</div>;
  if (!data) return <p className="small-note">Loading…</p>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13 }}>
          You need at least <b>{data.minPct}%</b> attendance in every course.{data.lateCountsPresent ? " Arriving late counts as attending." : " Arriving late counts as absent."}{data.excusedExcluded ? " Excused absences aren't held against you." : " Excused absences still count as not attended."}
        </span>
        <Link href="/attend" className="btn btn-brass btn-sm">Scan attendance code</Link>
      </div>
      {data.courses.length === 0 && <div className="card" style={{ margin: 0 }}><p className="small-note" style={{ margin: 0 }}>You aren&apos;t enrolled in any course this semester yet.</p></div>}
      {data.courses.map((c) => (
        <div key={c.courseId} className="card" style={{ margin: 0, borderLeft: `4px solid ${COLOR[c.standing]}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ minWidth: 0, flex: 1 }}><b>{c.code}</b> {c.title}<div className="small-note">{c.instructor}</div></div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLOR[c.standing] }}>{c.pct === null ? "—" : `${c.pct}%`}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLOR[c.standing] }}>{c.label}</div>
            </div>
          </div>
          {c.pct !== null && (
            <div style={{ position: "relative", height: 8, background: "var(--line)", borderRadius: 4, margin: "10px 0 6px" }} aria-hidden="true">
              <div style={{ width: `${Math.min(100, c.pct)}%`, height: "100%", borderRadius: 4, background: COLOR[c.standing] }} />
              <div title={`Minimum ${data.minPct}%`} style={{ position: "absolute", left: `${data.minPct}%`, top: -3, bottom: -3, width: 2, background: "var(--ink)" }} />
            </div>
          )}
          <div className="small-note">
            {c.present} present · {c.late} late · {c.absent} absent · {c.excused} excused · {c.marked} lecture{c.marked === 1 ? "" : "s"} marked
            {c.standing === "CANNOT_RECOVER" ? ` · even attending all ${c.remaining} remaining lectures reaches only ${c.best}% — speak to your advisor` : c.canMiss !== null && c.remaining > 0 ? (c.standing === "SHORT" ? ` · attend at least ${c.remaining - c.canMiss} of the ${c.remaining} lectures still to come to get back to ${data.minPct}%` : ` · you can miss ${c.canMiss} of the ${c.remaining} lectures still to come and stay at ${data.minPct}%`) : ""}
          </div>
          <button type="button" className="hp-back" style={{ marginTop: 8 }} onClick={() => toggle(c.courseId)}>{open === c.courseId ? "Hide lectures" : "Lecture by lecture"}</button>
          {open === c.courseId && (
            <div style={{ overflowX: "auto", marginTop: 6 }}>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th>Lecture</th><th>Date</th><th>Topic</th><th>Attendance</th></tr></thead>
                <tbody>{history.map((h) => <tr key={h.lectureNumber}><td>{h.lectureNumber}</td><td>{h.date || "—"}</td><td>{h.topic}</td><td>{STATUS[h.status] || h.status}</td></tr>)}</tbody>
              </table>
              {history.length === 0 && <p className="small-note" style={{ margin: "4px 0 0" }}>No lectures marked yet.</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** The warning across the student portal when attendance is short (or close) in any course. */
export function AttendanceWarning() {
  const [rows, setRows] = useState<CourseAtt[]>([]);
  const [min, setMin] = useState(75);
  useEffect(() => {
    const KEY = "att-warning";
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (c && Date.now() - c.at < 5 * 60_000) { setRows(c.rows); setMin(c.min); return; }
    } catch { /* ignore */ }
    fetch("/api/student/attendance").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      const bad = (d.courses as CourseAtt[]).filter((c) => c.standing === "SHORT" || c.standing === "CANNOT_RECOVER" || c.standing === "AT_RISK");
      setRows(bad); setMin(d.minPct);
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rows: bad, min: d.minPct })); } catch { /* ignore */ }
    }).catch(() => null);
  }, []);
  if (!rows.length) return null;
  const short = rows.filter((r) => r.standing !== "AT_RISK");
  return (
    <div role="alert" style={{ border: `1px solid ${short.length ? "var(--rust)" : "#E7C27A"}`, background: short.length ? "#FDF3F2" : "#FFF8E8", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
      <b>{short.length ? `Attendance shortage in ${short.length} course${short.length > 1 ? "s" : ""}` : "Attendance close to the minimum"}</b>{" "}
      {rows.map((r) => `${r.code} ${r.pct}%`).join(" · ")} — the minimum is {min}%.{" "}
      <Link href="/student/attendance">See what you can still do →</Link>
    </div>
  );
}
