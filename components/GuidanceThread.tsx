"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Comment = { id: string; body: string; authorRole: string; createdAt: string };

export default function GuidanceThread({ courseId, initialComments, apiBase }: { courseId: string; initialComments: Comment[]; apiBase: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");

  async function post() {
    if (!text.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/guidance`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setText(""); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>OMC Guidance Thread</h3>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 260, overflowY: "auto" }}>
        {initialComments.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No messages yet.</p>}
        {initialComments.map((c) => (
          <div key={c.id} style={{
            alignSelf: c.authorRole === "OMC" ? "flex-start" : "flex-end",
            background: c.authorRole === "OMC" ? "#F4EFE1" : "#E4EEE8", padding: "8px 12px", maxWidth: "80%",
          }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--slate)", marginBottom: 3 }}>{c.authorRole === "OMC" ? "OMC" : "Instructor"}</div>
            <div style={{ fontSize: 12.5 }}>{c.body}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message..." style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)" }} />
        <button onClick={post} disabled={loading} className="btn btn-brass">{loading ? "Sending…" : "Send"}</button>
      </div>
    </div>
  );
}
