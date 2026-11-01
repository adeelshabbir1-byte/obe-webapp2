"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type R = { id: string; n: number; topic: string; subtopic: string | null };
type M = { id: string; label: string };

/** Merge two lectures, split one, or unmerge — on the Lecture Content tab (same rules as the Topic Workspace). */
export default function LectureMergeSplit({ courseId, plan, rows, merges }: { courseId: string; plan: "SE" | "INSTRUCTOR"; rows: R[]; merges: M[] }) {
  const router = useRouter();
  const [a, setA] = useState(""), [b, setB] = useState(""), [s, setS] = useState(""), [topic, setTopic] = useState(""), [sub, setSub] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function call(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/faculty/topic-workspace/lectures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, plan, ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409 && j.warnings) { if (window.confirm(`Merge anyway?\n\n${(j.warnings as string[]).join("\n")}`)) return call({ ...body, confirm: true }); return; }
    if (!r.ok) { setMsg({ ok: false, text: j.changed ? `Can't unmerge — changed since: ${(j.changed as string[]).join(" ")}` : j.error || `HTTP ${r.status}` }); return; }
    const sent = (j.proposals || []).length;
    setMsg({ ok: true, text: sent ? "Sent to the Subject Expert as a proposal." : "Done." });
    setA(""); setB(""); setS(""); setTopic(""); setSub("");
    router.refresh();
  }
  const opt = (r: R) => <option key={r.id} value={r.id}>L{r.n} {r.topic.slice(0, 60)}</option>;
  return (
    <details className="card no-print" style={{ fontSize: 13 }} data-merge-split>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Merge or split lectures</summary>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <b style={{ minWidth: 48 }}>Merge</b>
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label="First lecture"><option value="">Lecture…</option>{rows.map(opt)}</select> +
        <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Second lecture"><option value="">Lecture…</option>{rows.filter((r) => r.id !== a).map(opt)}</select>
        <button className="btn btn-sm" disabled={busy || !a || !b} onClick={() => call({ action: "merge", rowIds: [a, b] })}>Merge</button>
        <span className="small-note">Both topics, every CLO, the weights added, quizzes and exam questions re-pointed; the freed slot becomes a “Free” lecture.</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <b style={{ minWidth: 48 }}>Split</b>
        <select value={s} onChange={(e) => { setS(e.target.value); const r = rows.find((x) => x.id === e.target.value); setTopic(r ? `${r.topic} (part 2)` : ""); setSub(""); }} aria-label="Lecture to split"><option value="">Lecture…</option>{rows.map(opt)}</select>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic of the second lecture" style={{ flex: "1 1 200px" }} aria-label="Second lecture topic" />
        <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Its sub-topics (blank: the second half)" style={{ flex: "1 1 200px" }} aria-label="Second lecture sub-topics" />
        <button className="btn btn-sm" disabled={busy || !s} onClick={() => call({ action: "split", rowId: s, second: { topic, ...(sub.trim() ? { subtopic: sub } : {}) } })}>Split</button>
      </div>
      {merges.length > 0 && <div style={{ marginTop: 8 }}>{merges.map((m) => <span key={m.id} style={{ marginRight: 10 }}>⇄ {m.label} <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call({ action: "unmerge", mergeId: m.id })}>Unmerge</button></span>)}</div>}
      {msg && <div className={msg.ok ? "small-note" : "err"} style={{ marginTop: 6 }}>{msg.text}</div>}
    </details>
  );
}
