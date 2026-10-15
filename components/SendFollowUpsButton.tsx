"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SendFollowUpsButton({ courseId, count }: { courseId: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send() {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/instructor/courses/${courseId}/follow-ups`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Could not send the follow-ups."); return; }
    setMsg(`Sent ${data.created} follow-up${data.created === 1 ? "" : "s"}. The teachers concerned and the OMC have been told.`);
    router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-brass" disabled={busy} onClick={send}>{busy ? "Sending…" : `Send ${count} follow-up${count === 1 ? "" : "s"}`}</button>
      {msg && <span className="small-note">{msg}</span>}
    </div>
  );
}
