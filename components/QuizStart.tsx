"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function QuizStart({ quizId, label }: { quizId: string; label: string }) {
  const router = useRouter(); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); const r = await fetch("/api/student/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quizId, action: "start" }) }); const d = await r.json().catch(() => ({})); setBusy(false); if (r.ok) router.refresh(); else setMsg(d.error || "Could not start."); }
  return <div><button type="button" className="btn" disabled={busy} onClick={go}>{busy ? "Starting…" : label}</button>{msg && <div className="err" style={{ marginTop: 6 }}>{msg}</div>}</div>;
}
