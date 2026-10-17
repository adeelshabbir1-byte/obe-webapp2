"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const SCALE = ["", "Not at all", "A little", "Fairly well", "Well", "Very well"];
export default function CourseExitForm({ courseId, clos, initial }: { courseId: string; clos: { id: string; code: string; statement: string }[]; initial: Record<string, number> | null }) {
  const router = useRouter();
  const [r, setR] = useState<Record<string, number>>(initial || {});
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");
  async function send() {
    const res = await fetch("/api/student/course-survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, ratings: r, comment }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Thank you — saved." : d.error || "Could not save."); if (res.ok) router.refresh();
  }
  return (
    <div>
      {clos.map((c) => (
        <div key={c.id} style={{ margin: "8px 0", fontSize: 13.5 }}>
          <div><b>{c.code}</b> {c.statement}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={r[c.id] === n ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setR({ ...r, [c.id]: n })}>{n} · {SCALE[n]}</button>)}</div>
        </div>))}
      <textarea placeholder="Anything that would have helped you learn better (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} style={{ width: "100%" }} />
      <button type="button" className="btn btn-sm" onClick={send}>{initial ? "Update" : "Submit"}</button> {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
