"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshPlanButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    if (!confirm("Replace your copy of this course plan (CLOs, lecture topics, assessments) with the Subject Expert's current plan? Your own changes to the plan will be lost.")) return;
    setBusy(true); setMsg("");
    const r = await fetch(`/api/instructor/courses/${courseId}/refresh-plan`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setMsg("Updated from the SE plan."); router.refresh(); } else setMsg(d.error || "Could not refresh.");
  }
  return <span className="no-print" style={{ fontSize: 12 }}><button className="btn btn-secondary btn-sm" disabled={busy} onClick={go} title="Only before teaching starts">{busy ? "Refreshing…" : "Refresh from SE plan"}</button>{msg && <span style={{ marginLeft: 8 }}>{msg}</span>}</span>;
}
