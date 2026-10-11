"use client";

import { useState } from "react";
import { GripIcon, useRowReorder, useDraftOrder, DraftOrderBar, topicGroups, isExamRow } from "./lectureDrag";

type Clo = { id: string; code: string };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; cloId: string | null; bloomLevel: string | null; weightPct: number };

const BLOOM_OPTIONS = ["", "C1", "C2", "C3", "C4", "C5", "C6"];

// Each cell edit updates only its own row's local state from the PATCH
// response, instead of router.refresh() re-fetching all 32 rows (plus
// the course's full CLO list) on every single blur/change event.
export default function LectureContentManager({ courseId, initialRows, clos, apiBase, generateEndpoint }: {
  courseId: string; initialRows: Row[]; clos: Clo[]; apiBase: string; generateEndpoint: string;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const content = (r: Row) => ({ topic: r.topic, subtopic: r.subtopic, cloId: r.cloId, bloomLevel: r.bloomLevel, weightPct: r.weightPct });
  const draft = useDraftOrder({ rows, setRows, content, url: `${apiBase}/courses/${courseId}/lecture/reorder`, merge: (r, raw) => ({ ...r, ...content(raw) }) });
  const [hoverTopic, setHoverTopic] = useState("");
  const groups = topicGroups(rows);
  const { rowProps, gripProps } = useRowReorder(rows.map((r) => r.id), draft.move, draft.saving);

  async function generate() {
    setLoading(true); setError("");
    try {
      const res = await fetch(generateEndpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setRows(data.rows || []);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveField(row: Row, field: "topic" | "subtopic" | "cloId" | "bloomLevel", value: string) {
    setBusyRow(row.id); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/lecture/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: field === "topic" ? value : row.topic,
          subtopic: field === "subtopic" ? value : row.subtopic,
          cloId: (field === "cloId" ? value : row.cloId) || null,
          bloomLevel: (field === "bloomLevel" ? value : row.bloomLevel) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyRow(null); return; }
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, topic: data.row.topic, subtopic: data.row.subtopic, cloId: data.row.cloId, bloomLevel: data.row.bloomLevel } : r));
      setBusyRow(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyRow(null); }
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Generate the lecture schedule</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
          Creates 32 rows (2 lectures per week), pre-filled from the HEC curriculum where available — all fully editable.
        </p>
        {error && <div className="err">{error}</div>}
        <button onClick={generate} disabled={loading} className="btn btn-brass">{loading ? "Generating…" : "Generate 32-Lecture Template"}</button>
      </div>
    );
  }

  const filledCount = rows.filter((r) => r.topic.trim().length > 0).length;
  const pct = Math.round((filledCount / rows.length) * 100);

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        {draft.dirty && <DraftOrderBar moved={draft.moved} saving={draft.saving} error={draft.error} onSave={draft.save} onDiscard={draft.discard} />}
        <div className="lp-toolbar">
          <h3>Lecture plan</h3>
          <span className="lp-meta">
            {<>{filledCount} of {rows.length} topics filled<span className="lp-progress"><span style={{ width: `${pct}%` }} /></span></>}
          </span>
        </div>
        <div className="lp-wrap"><div className="lp-scroll">
          <table className="lp-table">
            <colgroup><col style={{ width: 34 }} /><col style={{ width: 66 }} /><col style={{ width: 48 }} /><col /><col /><col style={{ width: 96 }} /><col style={{ width: 84 }} /><col style={{ width: 76 }} /></colgroup>
            <thead><tr><th></th><th>Week</th><th>Lec</th><th>Topic</th><th>Sub-topic</th><th>CLO</th><th>Bloom</th><th style={{ textAlign: "right" }}>Weight</th></tr></thead>
            <tbody>
              {rows.map((r, idx) => {
                const weekStart = idx === 0 || rows[idx - 1].week !== r.week;
                const exam = isExamRow(r.topic);
                return (
                  <tr key={r.id} className={[weekStart ? "lp-week-start" : "", exam ? "lp-exam" : "", draft.isMoved(r.id) ? "lp-moved" : "", hoverTopic && groups[idx].key === hoverTopic && groups[idx].total > 1 ? "lp-match" : ""].join(" ")} {...rowProps(r.id)}
                    onMouseEnter={() => setHoverTopic(groups[idx].key)} onMouseLeave={() => setHoverTopic("")}>
                    <td style={{ textAlign: "center" }}><button {...gripProps(r.id, `lecture ${r.lectureNumber}`)}><GripIcon /></button></td>
                    <td className="lp-week">{weekStart ? r.week : ""}</td>
                    <td className="lp-num">{r.lectureNumber}</td>
                    <td className="lp-topic" style={{ background: groups[idx].tint }}>
                      <span className={`lp-accent${groups[idx].first ? "" : " lp-join-top"}${groups[idx].last ? "" : " lp-join-bottom"}`} style={{ background: groups[idx].tone }} />
                      {groups[idx].first && groups[idx].total > 1 && <span className="lp-count" title={`${groups[idx].total} lectures in the plan have this topic`}>{groups[idx].run > 1 && groups[idx].run === groups[idx].total ? `${groups[idx].run} lectures` : `${groups[idx].run} of ${groups[idx].total}`}</span>}
                      <input key={`t-${r.id}-${r.topic}`} className={`lp-input${groups[idx].first ? "" : " lp-cont"}`} defaultValue={r.topic} disabled={busyRow === r.id || draft.dirty} placeholder="Add a topic"
                        onBlur={(e) => { if (e.target.value !== r.topic) saveField(r, "topic", e.target.value); }} />
                    </td>
                    <td>
                      <input key={`s-${r.id}-${r.subtopic}`} className="lp-input" defaultValue={r.subtopic || ""} disabled={busyRow === r.id || draft.dirty} placeholder={r.topic ? "Same as topic" : "Sub-topic"}
                        onBlur={(e) => { if (e.target.value !== (r.subtopic || "")) saveField(r, "subtopic", e.target.value); }} />
                    </td>
                    <td>
                      <select key={`c-${r.id}-${r.cloId}`} className="lp-select" defaultValue={r.cloId || ""} disabled={busyRow === r.id || draft.dirty} onChange={(e) => saveField(r, "cloId", e.target.value)}>
                        <option value="">—</option>
                        {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                      </select>
                    </td>
                    <td>
                      <select key={`b-${r.id}-${r.bloomLevel}`} className="lp-select" defaultValue={r.bloomLevel || ""} disabled={busyRow === r.id || draft.dirty} onChange={(e) => saveField(r, "bloomLevel", e.target.value)}>
                        {BLOOM_OPTIONS.map((b) => <option key={b} value={b}>{b || "—"}</option>)}
                      </select>
                    </td>
                    <td className="lp-weight">{r.weightPct ? <b>{r.weightPct}%</b> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
        <p className="lp-hint">
          Drag lectures by their handle <span style={{ display: "inline-flex", verticalAlign: "middle", color: "var(--text-2)" }}><GripIcon /></span> to new slots — the lectures in between shift by one, and the week and lecture numbers stay in place.
          Moves are kept on the page until you press Save order (editing cells is paused until then).
          Keyboard: focus the handle and press ↑ or ↓. Each topic has its own colour; lectures on the same topic are joined by one bar, and pointing at a lecture highlights every other lecture with that topic.
          Weights fill in from the Assessments tab.
        </p>
      </div>
    </>
  );
}
