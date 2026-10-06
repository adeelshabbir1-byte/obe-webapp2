"use client";

import { useEffect, useState } from "react";

type Clo = { statement: string; bloomLevel: string; mappedPloId: string | null };
type Topic = { lectureNumber: number; topic: string; subtopic: string };
type Plo = { id: string; number: number; title: string };

export default function MasterCourseEditor({ courseId }: { courseId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [course, setCourse] = useState<{ code: string; title: string } | null>(null);
  const [catalogDescription, setCatalogDescription] = useState("");
  const [textbook, setTextbook] = useState("");
  const [referenceMaterial, setReferenceMaterial] = useState("");
  const [clos, setClos] = useState<Clo[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [plos, setPlos] = useState<Plo[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/master-design/${courseId}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Couldn't open this course."); return; }
      setCourse(d.course); setPlos(d.plos);
      setCatalogDescription(d.course.catalogDescription || ""); setTextbook(d.course.textbook || ""); setReferenceMaterial(d.course.referenceMaterial || "");
      setClos(d.clos.map((c: any) => ({ statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId })));
      const byNumber = new Map<number, any>(d.topics.map((t: any) => [t.lectureNumber, t]));
      setTopics(Array.from({ length: 32 }, (_, i) => ({ lectureNumber: i + 1, topic: byNumber.get(i + 1)?.topic || "", subtopic: byNumber.get(i + 1)?.subtopic || "" })));
      setLoaded(true);
    })();
  }, [courseId]);

  async function save() {
    setSaving(true); setMsg(""); setError("");
    const res = await fetch(`/api/master-design/${courseId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogDescription, textbook, referenceMaterial, clos, topics }) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) setMsg(`Saved: ${d.clos} CLOs and ${d.topics} lecture topics.`); else setError(d.error || "Couldn't save.");
  }
  const upClo = (i: number, patch: Partial<Clo>) => setClos((p) => p.map((c, j) => j === i ? { ...c, ...patch } : c));
  const upTopic = (i: number, patch: Partial<Topic>) => setTopics((p) => p.map((t, j) => j === i ? { ...t, ...patch } : t));
  const input = { padding: 6, border: "1px solid var(--line)", width: "100%" } as const;

  if (error && !loaded) return <div className="err">{error}</div>;
  if (!loaded || !course) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{course.code} — {course.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>This is the Master Curriculum version, shared by every institute. Save when you're done — nothing is lost if you leave and come back.</p>
      {error && <div className="err">{error}</div>}
      {msg && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{msg}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Description and books</h3>
        <label style={{ fontSize: 12 }}>Catalog description</label>
        <textarea value={catalogDescription} onChange={(e) => setCatalogDescription(e.target.value)} rows={4} style={{ ...input, marginBottom: 8 }} />
        <label style={{ fontSize: 12 }}>Textbook</label>
        <input value={textbook} onChange={(e) => setTextbook(e.target.value)} style={{ ...input, marginBottom: 8 }} />
        <label style={{ fontSize: 12 }}>Reference material</label>
        <textarea value={referenceMaterial} onChange={(e) => setReferenceMaterial(e.target.value)} rows={3} style={input} />
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Course Learning Outcomes</h3>
        {clos.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
            <strong style={{ width: 52, paddingTop: 6 }}>CLO-{i + 1}</strong>
            <textarea value={c.statement} onChange={(e) => upClo(i, { statement: e.target.value })} rows={2} style={{ ...input, flex: 1 }} placeholder="Students will be able to…" />
            <select value={c.bloomLevel} onChange={(e) => upClo(i, { bloomLevel: e.target.value })} style={{ padding: 6, border: "1px solid var(--line)" }}>{["C1", "C2", "C3", "C4", "C5", "C6"].map((b) => <option key={b}>{b}</option>)}</select>
            <select value={c.mappedPloId || ""} onChange={(e) => upClo(i, { mappedPloId: e.target.value || null })} style={{ padding: 6, border: "1px solid var(--line)", maxWidth: 170 }}>
              <option value="">No PLO</option>{plos.map((p) => <option key={p.id} value={p.id}>PLO-{p.number} {p.title.slice(0, 20)}</option>)}
            </select>
            <button type="button" className="btn" onClick={() => setClos((p) => p.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setClos((p) => [...p, { statement: "", bloomLevel: "C2", mappedPloId: null }])}>+ Add CLO</button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Lecture plan (32 lectures)</h3>
        <table>
          <thead><tr><th style={{ width: 40 }}>#</th><th>Topic</th><th>Subtopics</th></tr></thead>
          <tbody>
            {topics.map((t, i) => (
              <tr key={t.lectureNumber}>
                <td>{t.lectureNumber}</td>
                <td><input value={t.topic} onChange={(e) => upTopic(i, { topic: e.target.value })} style={input} /></td>
                <td><input value={t.subtopic} onChange={(e) => upTopic(i, { subtopic: e.target.value })} style={input} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-brass" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save design"}</button>
    </div>
  );
}
