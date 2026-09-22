"use client";

import { useState } from "react";

type IncomingNote = { id: string; body: string; createdAt: string; fromCourse: string };
type MyNote = { id: string; body: string; createdAt: string };

export default function FeedForwardNotes({ courseId, incoming, myNotes: initialMyNotes }: { courseId: string; incoming: IncomingNote[]; myNotes: MyNote[] }) {
  const [myNotes, setMyNotes] = useState<MyNote[]>(initialMyNotes);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");

  async function addNote() {
    if (!text.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/feedforward`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setMyNotes((prev) => [...prev, data.note]);
      setText(""); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {incoming.length > 0 && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: "var(--brass-dark)" }}>Notes From Previous Instructors</h3>
          {incoming.map((n) => (
            <div key={n.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #EFEADC" }}>
              <div style={{ fontSize: 11, color: "var(--slate)", marginBottom: 3 }}>From {n.fromCourse}</div>
              <div style={{ fontSize: 12.5 }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Leave a Note for the Next Instructor</h3>
        {error && <div className="err">{error}</div>}
        {myNotes.map((n) => (
          <div key={n.id} style={{ fontSize: 12, color: "var(--slate)", marginBottom: 8 }}>{n.body}</div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Students struggled with Graph Theory — consider adding an extra practice lecture..." style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)" }} />
          <button onClick={addNote} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Add Note"}</button>
        </div>
      </div>
    </>
  );
}
