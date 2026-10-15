"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES: [string, string][] = [["IDEA", "Idea / improvement"], ["PROBLEM", "Something is wrong"], ["USABILITY", "Hard to use"], ["OTHER", "Other"]];

export default function FeedbackForm({ defaultPage }: { defaultPage?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState("IDEA");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pageUrl, setPageUrl] = useState(defaultPage || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, title, body, pageUrl: pageUrl.trim() || null }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || "Could not send." }); return; }
    setMsg({ ok: true, text: "Thank you — your feedback has been sent. You will be told when it is answered." });
    setTitle(""); setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={send} style={{ display: "grid", gap: 10, maxWidth: 720 }}>
      <label className="field">What kind of feedback?
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="field">Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Let me copy last semester's quizzes into this course" required />
      </label>
      <label className="field">Details
        <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder="What you were doing, what would help, and why it matters" required />
      </label>
      <label className="field">Page it is about (optional)
        <input value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} maxLength={300} placeholder="/instructor/courses" />
      </label>
      {msg && <div className={msg.ok ? "small-note" : "err"} style={msg.ok ? { color: "var(--sage)" } : undefined}>{msg.text}</div>}
      <div><button className="btn btn-brass" type="submit" disabled={busy}>{busy ? "Sending…" : "Send feedback"}</button></div>
    </form>
  );
}
