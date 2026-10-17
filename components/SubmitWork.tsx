"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubmitWork({ boxId, label }: { boxId: string; label: string }) {
  const router = useRouter(); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg("");
    const fd = new FormData(e.currentTarget); fd.set("boxId", boxId);
    const r = await fetch("/api/student/submissions", { method: "POST", body: fd }); const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) setMsg(d.error || "Upload failed."); else { setMsg(d.late ? "Submitted (late)." : "Submitted."); router.refresh(); }
  }
  return (
    <form onSubmit={send} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
      <input type="file" name="file" required accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.txt,.py,.java,.cpp,.c,.ipynb,image/*" />
      <input name="note" placeholder="Note or link (optional)" style={{ width: 220 }} />
      <button className="btn btn-sm" disabled={busy}>{busy ? "Uploading…" : label}</button>{msg && <span style={{ fontSize: 13 }}>{msg}</span>}
    </form>
  );
}
