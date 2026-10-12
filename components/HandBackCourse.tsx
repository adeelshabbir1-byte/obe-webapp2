"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** On My Assigned Courses: give a course back (e.g. not my specialisation). Works until the plan is submitted to the OMC. */
export default function HandBackCourse({ courseId, code }: { courseId: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    const note = window.prompt(`Give ${code} back? Whoever assigned it will see your reason and can give it to someone else.\n\nReason (e.g. not my specialisation):`);
    if (!note || !note.trim()) return;
    setBusy(true);
    const r = await fetch("/api/faculty/assignment-response", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, as: "SUBJECT_EXPERT", decision: "DECLINE", note }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { window.alert(d.error || "Could not hand it back."); return; }
    router.refresh();
  }
  return <button className="act" style={{ marginLeft: 6, cursor: "pointer", background: "none" }} disabled={busy} onClick={go}>{busy ? "…" : "Decline"}</button>;
}
