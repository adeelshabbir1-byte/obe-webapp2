"use client";

import { useState } from "react";

type CourseOption = { id: string; code: string; title: string; category: string; topicCount: number; locked?: string };
type Topic = { id?: string; topic: string; subtopic: string | null; originCourseId?: string; clo?: string | null; links?: number; pinned?: boolean };
type Column = { id: string; code: string; title: string; topics: Topic[] };

// mode "master": the Super User's official curriculum (topic text only). mode "faculty": a teacher's own courses,
// where each topic is a lecture row that keeps its id (see lib/facultyTopicWorkspace.ts).
export default function TopicWorkspace({ curriculumId, courses, mode = "master" }: { curriculumId?: string; courses: CourseOption[]; mode?: "master" | "faculty" }) {
  const faculty = mode === "faculty";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dragFrom, setDragFrom] = useState<{ col: number; idx: number } | null>(null);
  const [filter, setFilter] = useState("");

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // cap at 3
      return [...prev, id];
    });
  }

  async function openWorkspace() {
    if (selectedIds.length < 2) return;
    setLoading(true); setError(""); setSaved(false);
    try {
      const res = await fetch(faculty ? `/api/faculty/topic-workspace?courseIds=${selectedIds.join(",")}` : `/api/admin/curricula/${curriculumId}/topics-workspace?courseIds=${selectedIds.join(",")}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setColumns(data.courses.map((c: any) => ({ id: c.id, code: c.code, title: c.title, topics: c.topics.map((t: any) => ({ id: t.id, topic: t.topic, subtopic: t.subtopic, originCourseId: t.originCourseId, clo: t.clo, links: t.links, pinned: t.pinned })) })));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  function handleDragStart(col: number, idx: number) {
    setDragFrom({ col, idx });
  }

  function handleDrop(targetCol: number, targetIdx: number) {
    if (!dragFrom || !columns) return;
    const item = columns[dragFrom.col].topics[dragFrom.idx];
    if (faculty && item?.pinned && columns[targetCol].id !== item.originCourseId) {
      setError(`"${item.topic || "This lecture"}" already has attendance recorded, so it can only be reordered within its own course.`); setDragFrom(null); return;
    }
    setError("");
    setColumns((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => ({ ...c, topics: [...c.topics] }));
      const [moved] = next[dragFrom.col].topics.splice(dragFrom.idx, 1);
      let insertAt = targetIdx;
      // if moving within the same column and the removal shifted indices, adjust
      if (dragFrom.col === targetCol && dragFrom.idx < targetIdx) insertAt -= 1;
      next[targetCol].topics.splice(insertAt, 0, moved);
      return next;
    });
    setDragFrom(null);
    setSaved(false);
  }

  function removeTopic(col: number, idx: number) {
    setColumns((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => ({ ...c, topics: [...c.topics] }));
      next[col].topics.splice(idx, 1);
      return next;
    });
    setSaved(false);
  }

  async function saveArrangement() {
    if (!columns) return;
    setSaving(true); setError("");
    try {
      const res = faculty
        ? await fetch(`/api/faculty/topic-workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courses: columns.map((c) => ({ courseId: c.id, rowIds: c.topics.map((t) => t.id) })) }) })
        : await fetch(`/api/admin/curricula/topics-workspace/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: columns.map((c) => ({ courseId: c.id, topics: c.topics.map((t) => ({ topic: t.topic, subtopic: t.subtopic })) })) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      // Reload so moved topics show they now belong to their new course.
      if (faculty) await openWorkspace();
      setSaving(false); setSaved(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  if (!columns) {
    const filtered = courses.filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()) || c.code.toLowerCase().includes(filter.toLowerCase()));
    return (
      <div>
        {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <input placeholder="Filter courses…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 6, fontSize: 12.5, width: 300, marginBottom: 10 }} />
        <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>{selectedIds.length} of 3 selected</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 500, overflowY: "auto", border: "1px solid var(--line)", padding: 10, marginBottom: 14 }}>
          {filtered.map((c) => (
            <label key={c.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", background: selectedIds.includes(c.id) ? "#F0EAD6" : "transparent" }}>
              <input type="checkbox" checked={selectedIds.includes(c.id)} disabled={!!c.locked || (!selectedIds.includes(c.id) && selectedIds.length >= 3)} onChange={() => toggleSelect(c.id)} />
              <span>{c.code} — {c.title} <span style={{ color: "var(--slate)" }}>({c.topicCount} topics{faculty && c.category ? ` · ${c.category}` : ""})</span>
                {c.locked && <span style={{ display: "block", fontSize: 10.5, color: "var(--rust)" }}>Can&apos;t be changed: {c.locked}</span>}</span>
            </label>
          ))}
        </div>
        <button onClick={openWorkspace} disabled={selectedIds.length < 2 || loading} className="btn btn-brass">
          {loading ? "Loading…" : `Open Workspace (${selectedIds.length} courses)`}
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {saved && <div style={{ color: "var(--sage)", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button onClick={() => { setColumns(null); setSaved(false); }} style={{ fontSize: 11.5, background: "none", border: "1px solid var(--line)", padding: "4px 10px", cursor: "pointer" }}>
          ← Change courses
        </button>
        <button onClick={saveArrangement} disabled={saving} className="btn btn-brass">{saving ? "Saving…" : "Save Arrangement"}</button>
      </div>

      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        {faculty
          ? "Drag a topic to reorder it, or into another course. Lectures are renumbered when you save. A topic moved to another course leaves its CLO and quiz/assignment links behind (they belonged to the old course) - map it again on that course's Lecture Content and Assessments tabs. Topics marked 🔒 have attendance and can only be reordered. Nothing is saved until you click Save."
          : "Drag a topic to move it into another course's list, or to reorder it within its own. Click ✕ to drop a topic entirely. Nothing is saved until you click Save."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, 1fr)`, gap: 12 }}>
        {columns.map((col, colIdx) => (
          <div key={col.id} style={{ border: "1px solid var(--line)", background: "#FAFAF8" }}>
            <div style={{ padding: "8px 10px", background: "#4A4A6A", color: "#fff", fontSize: 12.5, fontWeight: 600 }}>
              {col.code} — {col.title} <span style={{ fontWeight: 400 }}>({col.topics.length})</span>
            </div>
            <div
              style={{ minHeight: 400, maxHeight: 650, overflowY: "auto", padding: 6 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleDrop(colIdx, col.topics.length); }}
            >
              {col.topics.map((t, idx) => (
                <div
                  key={t.id || idx}
                  draggable
                  onDragStart={() => handleDragStart(colIdx, idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); e.preventDefault(); handleDrop(colIdx, idx); }}
                  style={{ background: "#fff", border: "1px solid var(--line)", padding: "6px 8px", marginBottom: 4, fontSize: 11.5, cursor: "grab", display: "flex", justifyContent: "space-between", gap: 6 }}
                >
                  <span>
                    <b>L{idx + 1}.</b> {t.topic || <i style={{ color: "var(--slate)" }}>(empty lecture)</i>}
                    {t.subtopic && <div style={{ fontSize: 10, color: "var(--slate)" }}>{t.subtopic}</div>}
                    {faculty && (
                      <div style={{ fontSize: 10, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {t.originCourseId !== col.id
                          ? <span style={{ color: "#B7791F", fontWeight: 600 }}>moved in — CLO and quiz links will be cleared</span>
                          : <>{t.clo && <span style={{ background: "#EEF2FA", padding: "0 5px", borderRadius: 3 }}>{t.clo}</span>}{!!t.links && <span style={{ color: "var(--slate)" }}>{t.links} assessment link{t.links > 1 ? "s" : ""}</span>}</>}
                        {t.pinned && <span title="Attendance recorded">🔒</span>}
                      </div>
                    )}
                  </span>
                  {!faculty && <button onClick={() => removeTopic(colIdx, idx)} style={{ background: "none", border: "none", color: "var(--rust)", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>✕</button>}
                </div>
              ))}
              {col.topics.length === 0 && <div style={{ fontSize: 11, color: "var(--slate)", padding: 10, textAlign: "center" }}>Drop topics here</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
