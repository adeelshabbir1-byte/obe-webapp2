"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** "Feedback is open for 3 courses" — shown across the student portal while the QEC feedback window is open. */
export default function FeedbackReminder() {
  const [due, setDue] = useState<{ courseId: string; code: string; closesOn: string | null }[]>([]);
  useEffect(() => {
    const KEY = "feedback-due";
    try { const c = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (c && Date.now() - c.at < 5 * 60_000) { setDue(c.due); return; } } catch { /* ignore */ }
    fetch("/api/student/feedback-due").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setDue(d.due || []);
      try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), due: d.due || [] })); } catch { /* ignore */ }
    }).catch(() => {});
  }, []);
  if (!due.length) return null;
  const closes = due.map((d) => d.closesOn).filter(Boolean).sort()[0];
  return (
    <div className="card" style={{ borderLeft: "4px solid #1F4E8C", fontSize: 13.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <b>Course feedback is open</b> for {due.length} course{due.length === 1 ? "" : "s"} ({due.map((d) => d.code).join(", ")}){closes ? ` — until ${closes}` : ""}. It is anonymous: teachers see only totals.
      <Link href={`/student/course-survey?course=${due[0].courseId}`} className="btn btn-sm">Give feedback</Link>
    </div>
  );
}
