"use client";

import { useEffect, useState } from "react";

type CourseOption = { id: string; code: string; title: string; category: string; topicCount: number; locked?: string };
type RefOption = { id: string; code: string; title: string; category: string; teachers?: string; topicCount?: number };
type Topic = { id?: string; topic: string; subtopic: string | null; originCourseId?: string; clo?: string | null; links?: number; pinned?: boolean; copiedFrom?: string };
type Column = { id: string; code: string; title: string; reference: boolean; topics: Topic[] };

/**
 * Topic Workspace for a Subject Expert or Instructor. Open 1–3 of your own courses and up to 2 other courses of the
 * institute for reference. Within your courses: drag to reorder or move topics. From a reference course: drag a topic
 * into one of yours to copy it. Onto a reference course: drag one of your topics to suggest it to that course's
 * teachers. Nothing changes in your plans until you save.
 */
export default function FacultyTopicWorkspace({ courses }: { courses: CourseOption[] }) {
  const [own, setOwn] = useState<string[]>([]);
  const [refs, setRefs] = useState<RefOption[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<RefOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [dirty, setDirty] = useState(false);
  const [dragFrom, setDragFrom] = useState<{ col: number; idx: number } | null>(null);
  const [suggest, setSuggest] = useState<{ topic: Topic; fromCourseId: string; to: Column } | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (columns) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/faculty/topic-workspace/courses?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setFound(res.ok ? data.courses : []);
      } catch { setFound([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, columns]);

  function toggleOwn(id: string) {
    setOwn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]));
  }
  function addRef(c: RefOption) {
    setRefs((prev) => (prev.some((r) => r.id === c.id) || prev.length >= 2 || own.includes(c.id) ? prev : [...prev, c]));
  }

  async function open() {
    setLoading(true); setError(""); setInfo(""); setDirty(false);
    try {
      const res = await fetch(`/api/faculty/topic-workspace?courseIds=${own.join(",")}&referenceIds=${refs.map((r) => r.id).join(",")}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not open the workspace."); setLoading(false); return; }
      setColumns(data.courses.map((c: Column) => ({ ...c, topics: c.topics.map((t) => ({ ...t })) })));
    } catch (e) { setError("Could not reach the server: " + (e as Error).message); }
    setLoading(false);
  }

  function drop(targetCol: number, targetIdx: number) {
    if (!dragFrom || !columns) return;
    const from = columns[dragFrom.col], to = columns[targetCol];
    const item = from.topics[dragFrom.idx];
    setDragFrom(null);
    if (!item) return;
    if (to.reference) {
      // Onto a course that is not yours: suggest the topic to its teachers.
      if (!from.reference && from.id !== to.id) { setSuggest({ topic: item, fromCourseId: from.id, to }); setNote(""); }
      return;
    }
    setError("");
    if (from.reference) {
      // Copy from a reference course: the reference stays as it is.
      setColumns((prev) => {
        if (!prev) return prev;
        const next = prev.map((c) => ({ ...c, topics: [...c.topics] }));
        next[targetCol].topics.splice(targetIdx, 0, { topic: item.topic, subtopic: item.subtopic, copiedFrom: from.code });
        return next;
      });
      setDirty(true);
      return;
    }
    if (item.pinned && item.originCourseId && item.originCourseId !== to.id) {
      setError(`"${item.topic}" already has attendance recorded, so it can only be reordered within its own course.`);
      return;
    }
    setColumns((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => ({ ...c, topics: [...c.topics] }));
      const [moved] = next[dragFrom.col].topics.splice(dragFrom.idx, 1);
      let at = targetIdx;
      if (dragFrom.col === targetCol && dragFrom.idx < targetIdx) at -= 1;
      next[targetCol].topics.splice(at, 0, moved);
      return next;
    });
    setDirty(true);
  }

  function removeCopy(col: number, idx: number) {
    setColumns((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => ({ ...c, topics: [...c.topics] }));
      next[col].topics.splice(idx, 1);
      return next;
    });
  }

  async function save() {
    if (!columns) return;
    setSaving(true); setError(""); setInfo("");
    try {
      const res = await fetch("/api/faculty/topic-workspace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: columns.filter((c) => !c.reference).map((c) => ({ courseId: c.id, items: c.topics.map((t) => (t.id ? { id: t.id } : { topic: t.topic, subtopic: t.subtopic })) })) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not save."); setSaving(false); return; }
      setInfo(`Saved.${data.moved ? ` ${data.moved} topic${data.moved === 1 ? "" : "s"} moved between courses.` : ""}${data.copied ? ` ${data.copied} topic${data.copied === 1 ? "" : "s"} copied in.` : ""}`);
      await open();
    } catch (e) { setError("Could not reach the server: " + (e as Error).message); }
    setSaving(false);
  }

  async function sendSuggestion() {
    if (!suggest) return;
    setError("");
    const res = await fetch("/api/faculty/topic-suggestions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromCourseId: suggest.fromCourseId, toCourseId: suggest.to.id, topic: suggest.topic.topic, subtopic: suggest.topic.subtopic, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Could not send the suggestion."); return; }
    setInfo(`Suggested "${suggest.topic.topic}" to ${suggest.to.code}. Its teachers have been told.`);
    setSuggest(null);
  }

  if (!columns) {
    return (
      <div>
        {error && <div className="err">{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Your courses <span className="small-note">({own.length} of 3)</span></h3>
            <div style={{ display: "grid", gap: 4, maxHeight: 420, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
              {courses.length === 0 && <p className="small-note">You have no courses yet.</p>}
              {courses.map((c) => (
                <label key={c.id} style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 6px", borderRadius: 6, background: own.includes(c.id) ? "var(--royal-50)" : "transparent" }}>
                  <input type="checkbox" checked={own.includes(c.id)} disabled={!!c.locked || (!own.includes(c.id) && own.length >= 3)} onChange={() => toggleOwn(c.id)} />
                  <span>{c.code} — {c.title} <span className="small-note">({c.topicCount} topics{c.category ? ` · ${c.category}` : ""})</span>
                    {c.locked && <span style={{ display: "block", fontSize: 11, color: "var(--rust)" }}>Can&apos;t be changed: {c.locked}</span>}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Reference courses <span className="small-note">(any course of the institute, up to 2)</span></h3>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, title or program…" aria-label="Search courses" style={{ width: "100%", marginBottom: 8 }} />
            {refs.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {refs.map((r) => <span key={r.id} className="badge badge-warn">{r.code} <button type="button" aria-label={`Remove ${r.code}`} onClick={() => setRefs((p) => p.filter((x) => x.id !== r.id))} style={{ border: 0, background: "none", cursor: "pointer" }}>✕</button></span>)}
              </div>
            )}
            <div style={{ display: "grid", gap: 4, maxHeight: 360, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
              {searching && <p className="small-note">Searching…</p>}
              {!searching && found.length === 0 && <p className="small-note">No courses found.</p>}
              {found.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "4px 6px" }}>
                  <span>{c.code} — {c.title}<span className="small-note" style={{ display: "block" }}>{c.category}{c.teachers ? ` · ${c.teachers}` : ""} · {c.topicCount ? `${c.topicCount} topics` : "no lecture plan yet"}</span></span>
                  <button type="button" className="btn btn-secondary btn-xs" disabled={refs.length >= 2 || refs.some((r) => r.id === c.id) || own.includes(c.id)} onClick={() => addRef(c)}>Add</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-brass" style={{ marginTop: 14 }} disabled={loading || own.length < 1 || own.length + refs.length < 2} onClick={open}>
          {loading ? "Opening…" : `Open workspace (${own.length} of yours${refs.length ? ` + ${refs.length} reference` : ""})`}
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {info && <div className="small-note" style={{ color: "var(--sage)", marginBottom: 8 }}>{info}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (!dirty || confirm("Leave without saving your changes?")) { setColumns(null); setInfo(""); } }}>← Change courses</button>
        <button type="button" className="btn btn-brass" disabled={saving || !dirty} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
      <p className="small-note" style={{ marginTop: 0 }}>
        Drag to reorder your topics or move them between your courses. Drag a topic from a reference course into yours to copy it.
        Drag one of your topics onto a reference course to suggest it to that course&apos;s teachers. A topic moved to another of your courses leaves its CLO and
        quiz / assignment links behind — map it again there.
      </p>
      {suggest && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <h4 style={{ marginTop: 0 }}>Suggest &quot;{suggest.topic.topic}&quot; to {suggest.to.code}</h4>
          <p className="small-note">Its Subject Expert and Instructor are told and can add it to their plan or decline it.</p>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this topic belongs there (optional)" maxLength={1000} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-brass btn-sm" onClick={sendSuggestion}>Send suggestion</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSuggest(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))`, gap: 12, overflowX: "auto" }}>
        {columns.map((col, ci) => (
          <div key={col.id} style={{ border: "1px solid var(--line)", borderRadius: 8, background: col.reference ? "#FBF8F7" : "var(--card)" }}>
            <div style={{ padding: "8px 10px", background: col.reference ? "var(--slate)" : "var(--navy-900)", color: "#fff", fontSize: 12.5, fontWeight: 600, borderRadius: "8px 8px 0 0" }}>
              {col.code} — {col.title} <span style={{ fontWeight: 400 }}>({col.topics.length}){col.reference ? " · reference, read-only" : ""}</span>
            </div>
            <div style={{ minHeight: 320, maxHeight: 640, overflowY: "auto", padding: 6 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); drop(ci, col.topics.length); }}>
              {col.topics.map((t, idx) => (
                <div
                  key={t.id || `new-${idx}-${t.topic}`}
                  draggable
                  onDragStart={() => setDragFrom({ col: ci, idx })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(ci, idx); }}
                  style={{ background: t.copiedFrom ? "#E2F4E8" : "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", marginBottom: 4, fontSize: 12, cursor: "grab", display: "flex", justifyContent: "space-between", gap: 6 }}
                >
                  <span>
                    <b>L{idx + 1}.</b> {t.topic || <i style={{ color: "var(--slate)" }}>(empty lecture)</i>}
                    {t.subtopic && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{t.subtopic}</div>}
                    {!col.reference && (
                      <div style={{ fontSize: 10.5, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {t.copiedFrom ? <span style={{ color: "var(--sage)", fontWeight: 600 }}>copied from {t.copiedFrom} — saved as a new lecture</span>
                          : t.originCourseId && t.originCourseId !== col.id ? <span style={{ color: "#96650F", fontWeight: 600 }}>moved in — CLO and quiz links will be cleared</span>
                            : <>{t.clo && <span className="badge badge-neutral">{t.clo}</span>}{!!t.links && <span className="small-note">{t.links} assessment link{t.links > 1 ? "s" : ""}</span>}</>}
                        {t.pinned && <span title="Attendance recorded">🔒</span>}
                      </div>
                    )}
                  </span>
                  {t.copiedFrom && <button type="button" aria-label="Remove copied topic" onClick={() => removeCopy(ci, idx)} style={{ background: "none", border: 0, color: "var(--rust)", cursor: "pointer" }}>✕</button>}
                </div>
              ))}
              {col.topics.length === 0 && <div className="small-note" style={{ padding: 10, textAlign: "center" }}>{col.reference ? "No lecture plan yet." : "Drop topics here"}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
