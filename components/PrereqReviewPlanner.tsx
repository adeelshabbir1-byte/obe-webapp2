"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Prompt = { linkId: string; strength: string; prereqCourseCode: string; prereqCourseTitle: string; prereqTopic: string; dependentTopic: string; dependentLectures: number[]; plan: { lectureNumber: number | null; status: string; note: string | null } | null };
type Lecture = { lectureNumber: number; week: number; topic: string };

/** One row per MILD / WEAK prerequisite: pick the lecture where the review happens, then mark it done once taught. */
export default function PrereqReviewPlanner({ courseId, prompts, lectures, canEdit }: { courseId: string; prompts: Prompt[]; lectures: Lecture[]; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState("");
  async function save(p: Prompt, body: Record<string, unknown>) {
    setBusy(p.linkId);
    const res = await fetch("/api/prereq-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, linkId: p.linkId, ...body }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    setMsg((m) => ({ ...m, [p.linkId]: res.ok ? { ok: !data.warning, text: data.warning || "Saved." } : { ok: false, text: data.error || "Could not save." } }));
    if (res.ok) router.refresh();
  }
  const suggested = (p: Prompt) => {
    const first = p.dependentLectures.length ? Math.min(...p.dependentLectures) : null;
    return first && first > 1 ? first - 1 : first || lectures[0]?.lectureNumber || 1;
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th>Prerequisite topic</th><th>Needed for</th><th>Kind</th><th>Review in</th><th>Status</th></tr></thead>
        <tbody>
          {prompts.map((p) => (
            <tr key={p.linkId}>
              <td><b>{p.prereqTopic}</b><div className="small-note">{p.prereqCourseCode} — {p.prereqCourseTitle}</div></td>
              <td>{p.dependentTopic}<div className="small-note">{p.dependentLectures.length ? `lecture ${p.dependentLectures.join(", ")}` : "not in your plan yet"}</div></td>
              <td><span className={`badge ${p.strength === "MILD" ? "badge-warn" : "badge-neutral"}`}>{p.strength === "MILD" ? "Review" : "Short recap"}</span></td>
              <td>
                {canEdit ? (
                  <select defaultValue={p.plan?.lectureNumber ?? ""} disabled={busy === p.linkId} aria-label="Lecture for the review"
                    onChange={(e) => e.target.value && save(p, { lectureNumber: Number(e.target.value), status: p.plan?.status || "PLANNED" })}>
                    <option value="">— choose (suggested: L{suggested(p)}) —</option>
                    {lectures.map((l) => <option key={l.lectureNumber} value={l.lectureNumber}>L{l.lectureNumber} · wk {l.week} · {l.topic.slice(0, 50)}</option>)}
                  </select>
                ) : p.plan?.lectureNumber ? `Lecture ${p.plan.lectureNumber}` : "—"}
                {msg[p.linkId] && <div className="small-note" style={{ color: msg[p.linkId].ok ? "var(--sage)" : "var(--rust)" }}>{msg[p.linkId].text}</div>}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {!p.plan ? <span className="badge badge-no">To plan</span> : p.plan.status === "DONE" ? <span className="badge badge-ok">Done</span> : <span className="badge badge-warn">Planned</span>}
                {canEdit && p.plan && p.plan.status !== "DONE" && <button type="button" className="act act-primary" style={{ marginLeft: 6 }} disabled={busy === p.linkId} onClick={() => save(p, { lectureNumber: p.plan!.lectureNumber, status: "DONE" })}>Mark done</button>}
                {canEdit && p.plan && <button type="button" className="act act-danger" style={{ marginLeft: 6 }} disabled={busy === p.linkId} onClick={() => save(p, { action: "remove" })}>Remove</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
