import { notesFor, CHECKPOINTS, ACK } from "../lib/feedForward";
import { ActionForm } from "./fyp/FypClient";

// "Notes from last time" on a course page, with this person's check-ins at the start, midterm and end.
export default async function FeedForwardPanel({ courseId, userId }: { courseId: string; userId: string }) {
  const notes = await notesFor(courseId).catch(() => []);
  if (!notes.length) return null;
  const owed = CHECKPOINTS.find(([cp]) => notes.some((n) => !n.acks.some((a) => a.userId === userId && a.checkpoint === cp)));
  const label = (k: string, list: readonly (readonly [string, string])[]) => list.find(([x]) => x === k)?.[1] || k;
  return (
    <div className="card" style={{ borderLeft: `5px solid ${owed ? "#B26A00" : "#2E7D32"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b>Notes from last time ({notes.length})</b>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: owed ? "#B26A00" : "#2E7D32" }}>{owed ? `${owed[1]} check-in due` : "All check-ins done"}</span>
      </div>
      <p className="small-note" style={{ marginTop: 2 }}>Left by earlier teachers / Subject Experts of this course. Check in on each at the start, at midterm and at the end: read it, then say whether you applied it, and how — the Program Lead and OMC see this as CQI evidence.</p>
      {notes.map((n) => { const mine = n.acks.filter((a) => a.userId === userId); return (
        <div key={n.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
          <div className="small-note" style={{ margin: 0 }}>{n.course.code} · {n.course.offeredTermName || ""} {n.course.offeredTermYear || ""} · {n.course.batch?.batchName || ""} · {n.author}</div>
          <div style={{ fontSize: 13, margin: "2px 0 4px" }}>{n.body}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11.5 }}>{CHECKPOINTS.map(([cp, l]) => { const a = mine.find((x) => x.checkpoint === cp); return <span key={cp} style={{ borderRadius: 999, padding: "1px 8px", background: a ? "#E2F4E8" : "#F3F5F8", color: a ? "#1F5E36" : "#778" }} title={a?.comment || ""}>{l}: {a ? label(a.status, ACK) : "—"}</span>; })}</div>
          <ActionForm showMessage url="/api/feed-forward" fixed={{ courseId, noteId: n.id }} submit="Save check-in" collapsed openLabel="Check in…" initial={{ checkpoint: owed?.[0] || "START", status: "READ" }}
            fields={[{ name: "checkpoint", label: "Check-in", type: "select", options: CHECKPOINTS.map(([k, l]) => [k, l] as [string, string]) }, { name: "status", label: "Status", type: "select", options: ACK.map(([k, l]) => [k, l] as [string, string]) }, { name: "comment", label: "Comment (how applied, or why not)", width: 300 }]} />
        </div>); })}
    </div>
  );
}
