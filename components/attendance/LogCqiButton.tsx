"use client";

import { useState } from "react";

/** Log a course's attendance shortage as a CQI finding (Institute Head and OMC — the people who keep CQI Records). */
export default function LogCqiButton({ courseId, batchId, code, average, short, minPct }: { courseId: string; batchId: string | null; code: string; average: number | null; short: number; minPct: number }) {
  const [state, setState] = useState<"" | "busy" | "done" | "error">("");
  async function log() {
    const finding = `Attendance in ${code}: average ${average ?? "—"}%, ${short} student${short === 1 ? "" : "s"} below the ${minPct}% minimum.`;
    if (!window.confirm(`Add this to CQI Records?\n\n${finding}`)) return;
    setState("busy");
    const r = await fetch("/api/chairman/cqi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ finding, courseId, batchId, sourceType: "Attendance", sourceReference: code, metricBefore: average }) }).catch(() => null);
    setState(r && r.ok ? "done" : "error");
  }
  if (state === "done") return <span className="small-note" style={{ color: "var(--sage)" }}>Logged in CQI Records</span>;
  return <button type="button" className="act" onClick={log} disabled={state === "busy"}>{state === "error" ? "Try again" : "Log CQI finding"}</button>;
}
