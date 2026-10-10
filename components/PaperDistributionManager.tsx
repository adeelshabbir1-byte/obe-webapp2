"use client";

import { useState } from "react";

type LectureRow = { id: string; topic: string; cloId: string | null; bloomLevel: string | null };
type Clo = { id: string; code: string; statement: string };
type Item = {
  id: string; examType: string | null; questionNo: number; lectureRowId: string | null; topicText: string;
  cloId: string | null; cognitiveLevel: string | null; marks: number;
};

const BLOOM_VERBS: Record<string, string> = {
  C1: "Define, List, Recall, Identify, Name, State, Label, Recognize",
  C2: "Explain, Describe, Summarize, Classify, Discuss, Interpret, Compare",
  C3: "Apply, Solve, Demonstrate, Use, Calculate, Illustrate, Implement, Show",
  C4: "Analyze, Differentiate, Examine, Categorize, Contrast, Investigate, Deconstruct",
  C5: "Evaluate, Justify, Critique, Assess, Argue, Defend, Recommend, Judge",
  C6: "Design, Develop, Construct, Formulate, Propose, Compose, Create, Devise",
};

// Midterm and Final are tracked (and numbered) completely independently —
// picking one here scopes every action (add, edit, move, remove, generate)
// to just that paper.
const EXAM_TYPES: ("Midterm" | "Final")[] = ["Midterm", "Final"];

export default function PaperDistributionManager({ apiBase, items: initialItems, lectureRows, clos, coverageByTopic, canGenerate }: {
  apiBase: string; items: Item[]; lectureRows: LectureRow[]; clos: Clo[];
  coverageByTopic?: Record<string, { lectureCount: number; covered: boolean; deliveredMarksPct: number }>;
  canGenerate?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const [newTopicSource, setNewTopicSource] = useState<Record<string, string>>({});
  const [newTopicText, setNewTopicText] = useState<Record<string, string>>({});
  const [newCloId, setNewCloId] = useState<Record<string, string>>({});
  const [newLevel, setNewLevel] = useState<Record<string, string>>({});
  const [newMarks, setNewMarks] = useState<Record<string, string>>({});

  function pickLectureRow(examType: string, lectureRowId: string) {
    setNewTopicSource((p) => ({ ...p, [examType]: lectureRowId }));
    const row = lectureRows.find((r) => r.id === lectureRowId);
    if (row) {
      setNewTopicText((p) => ({ ...p, [examType]: row.topic }));
      setNewCloId((p) => ({ ...p, [examType]: row.cloId || "" }));
      setNewLevel((p) => ({ ...p, [examType]: row.bloomLevel || "" }));
    } else {
      setNewTopicText((p) => ({ ...p, [examType]: "" }));
      setNewCloId((p) => ({ ...p, [examType]: "" }));
      setNewLevel((p) => ({ ...p, [examType]: "" }));
    }
  }

  async function addItem(examType: string) {
    const topicText = newTopicText[examType] || "";
    const marks = newMarks[examType] || "";
    if (!topicText.trim() || !marks) { setError("Topic and marks are required."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(apiBase, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examType, lectureRowId: newTopicSource[examType] || null, topicText,
          cloId: newCloId[examType] || null, cognitiveLevel: newLevel[examType] || null, marks,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setItems((prev) => [...prev, data.item]);
      setNewTopicSource((p) => ({ ...p, [examType]: "" }));
      setNewTopicText((p) => ({ ...p, [examType]: "" }));
      setNewCloId((p) => ({ ...p, [examType]: "" }));
      setNewLevel((p) => ({ ...p, [examType]: "" }));
      setNewMarks((p) => ({ ...p, [examType]: "" }));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${apiBase}/${itemId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicText: fd.get("topicText"), cloId: fd.get("cloId") || null,
          cognitiveLevel: fd.get("cognitiveLevel") || null, marks: fd.get("marks"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setItems((prev) => prev.map((it) => it.id === itemId ? data.item : it));
      setEditingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeItem(itemId: string, examType: string | null) {
    setLoading(true);
    await fetch(`${apiBase}/${itemId}`, { method: "DELETE" });
    setItems((prev) => {
      const rest = prev.filter((it) => it.id !== itemId);
      let n = 0;
      return rest.map((it) => it.examType === examType ? { ...it, questionNo: ++n } : it);
    });
    setLoading(false);
  }

  async function moveItem(itemId: string, direction: "up" | "down", examType: string | null) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/${itemId}/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      // Mirror the server's swap-then-renumber, scoped to this exam only
      // (questionNo always == position-within-exam + 1).
      setItems((prev) => {
        const within = prev.filter((it) => it.examType === examType);
        const others = prev.filter((it) => it.examType !== examType);
        const idx = within.findIndex((it) => it.id === itemId);
        const swapWith = direction === "up" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= within.length) return prev;
        [within[idx], within[swapWith]] = [within[swapWith], within[idx]];
        const renumbered = within.map((it, i) => ({ ...it, questionNo: i + 1 }));
        return [...others, ...renumbered];
      });
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function generateFromAssessments(examType: "Midterm" | "Final") {
    if (!confirm(
      `Generate the ${examType} paper from what you already mapped on the Assessments & Submit tab?\n\n` +
      `This REPLACES every question currently listed here for the ${examType} with fresh ones built from ` +
      `that mapping (topic, CLO, cognitive level, marks). Any manual edits you made here for the ${examType} ` +
      `since your last Generate will be lost — the cognitive level and topic stay editable afterwards, ` +
      `but re-generating starts over from the mapping again.`
    )) return;
    setGenerating(examType); setError("");
    try {
      const res = await fetch(`${apiBase}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setGenerating(null); return; }
      setItems((prev) => [...prev.filter((it) => it.examType !== examType), ...data.items]);
      setGenerating(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setGenerating(null); }
  }

  function cloLabel(id: string | null) {
    if (!id) return "—";
    const c = clos.find((x) => x.id === id);
    return c ? c.code : "—";
  }

  function actualCoverageFor(topicText: string) {
    if (!coverageByTopic) return null;
    return coverageByTopic[topicText.trim().toLowerCase()] || null;
  }

  const cloOptions = (
    <>
      <option value="">— No CLO —</option>
      {clos.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.statement.slice(0, 40)}</option>)}
    </>
  );
  const levelOptions = Object.keys(BLOOM_VERBS).map((k) => <option key={k} value={k}>{k}</option>);

  const legacyItems = items.filter((it) => it.examType !== "Midterm" && it.examType !== "Final");

  function renderSection(examType: "Midterm" | "Final" | null, label: string) {
    const sectionItems = items.filter((it) => it.examType === examType).sort((a, b) => a.questionNo - b.questionNo);
    const totalMarks = sectionItems.reduce((s, i) => s + i.marks, 0);
    const byLevel = new Map<string, number>();
    for (const i of sectionItems) if (i.cognitiveLevel) byLevel.set(i.cognitiveLevel, (byLevel.get(i.cognitiveLevel) || 0) + i.marks);
    const key = examType || "legacy";
    const level = newLevel[key] || "";

    return (
      <div key={key} style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{label}</h2>
          {examType && canGenerate && (
            <button
              onClick={() => generateFromAssessments(examType)}
              disabled={generating !== null}
              className="btn btn-brass"
              style={{ padding: "6px 12px", fontSize: 12 }}
              title="Pulls topic, CLO, cognitive level and marks straight from your Midterm/Final Q# mapping on the Assessments & Submit tab."
            >
              {generating === examType ? "Generating…" : "Generate from Assessments Tab"}
            </button>
          )}
        </div>

        <div className="card" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{totalMarks}</div><div style={{ fontSize: 11, color: "var(--slate)" }}>Total Marks</div></div>
          {Array.from(byLevel.entries()).sort().map(([lvl, marks]) => (
            <div key={lvl}><div style={{ fontSize: 20, fontWeight: 700 }}>{marks}</div><div style={{ fontSize: 11, color: "var(--slate)" }}>{lvl} Marks</div></div>
          ))}
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Q. No.</th><th>Topic</th><th>CLO</th><th>Cognitive Level</th><th>Suggested Verbs</th><th>Marks</th>{coverageByTopic && <th>Actual Coverage</th>}<th></th></tr></thead>
            <tbody>
              {sectionItems.length === 0 && <tr><td colSpan={coverageByTopic ? 8 : 7} style={{ color: "var(--slate)" }}>No questions added yet.</td></tr>}
              {sectionItems.map((it, i) => (
                editingId === it.id ? (
                  <tr key={it.id}>
                    <td colSpan={coverageByTopic ? 8 : 7}>
                      <form onSubmit={(e) => saveEdit(e, it.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                        <span style={{ fontWeight: 600 }}>Q{it.questionNo}</span>
                        <input name="topicText" defaultValue={it.topicText} style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                        <select name="cloId" defaultValue={it.cloId ?? ""} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>{cloOptions}</select>
                        <select name="cognitiveLevel" defaultValue={it.cognitiveLevel ?? ""} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                          <option value="">—</option>{levelOptions}
                        </select>
                        <input name="marks" type="number" step="0.5" min={0} defaultValue={it.marks} style={{ width: 70, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                        <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)} style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", cursor: "pointer" }}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={it.id}>
                    <td>
                      Q{it.questionNo}
                      <div style={{ display: "inline-flex", gap: 2, marginLeft: 6 }}>
                        <button onClick={() => moveItem(it.id, "up", examType)} disabled={loading || i === 0} style={{ background: "none", border: "1px solid var(--line)", cursor: i === 0 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                        <button onClick={() => moveItem(it.id, "down", examType)} disabled={loading || i === sectionItems.length - 1} style={{ background: "none", border: "1px solid var(--line)", cursor: i === sectionItems.length - 1 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === sectionItems.length - 1 ? 0.3 : 1 }}>▼</button>
                      </div>
                    </td>
                    <td>{it.topicText}</td>
                    <td>{cloLabel(it.cloId)}</td>
                    <td>{it.cognitiveLevel || "—"}</td>
                    <td style={{ fontSize: 11, color: "var(--slate)" }}>{it.cognitiveLevel ? BLOOM_VERBS[it.cognitiveLevel] : "—"}</td>
                    <td>{it.marks}</td>
                    {coverageByTopic && (() => {
                      const cov = actualCoverageFor(it.topicText);
                      return (
                        <td style={!cov?.covered ? { background: "#FBE2DF", color: "var(--rust)", fontWeight: 700 } : { color: "var(--sage)" }}>
                          {cov ? `${cov.covered ? "Covered" : "Not Yet"} · ${cov.lectureCount} lec · ${Math.round(cov.deliveredMarksPct)}% delivered` : "No matching topic"}
                        </td>
                      );
                    })()}
                    <td style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setEditingId(it.id)} className="act act-primary">Edit</button>
                      <button onClick={() => removeItem(it.id, examType)} className="act act-danger">Remove</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>

        {examType && (
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add a {examType} Question by Hand</h3>
            <div className="field">
              <label>Pick a Topic from the Lecture Plan (auto-fills CLO & level — optional)</label>
              <select value={newTopicSource[key] || ""} onChange={(e) => pickLectureRow(key, e.target.value)}>
                <option value="">— Type a custom topic instead —</option>
                {lectureRows.map((r) => <option key={r.id} value={r.id}>{r.topic}</option>)}
              </select>
            </div>
            <div className="field"><label>Topic / Question Text</label><input value={newTopicText[key] || ""} onChange={(e) => setNewTopicText((p) => ({ ...p, [key]: e.target.value }))} placeholder="e.g. Binary Search Trees" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div className="field"><label>CLO</label><select value={newCloId[key] || ""} onChange={(e) => setNewCloId((p) => ({ ...p, [key]: e.target.value }))}>{cloOptions}</select></div>
              <div className="field"><label>Cognitive Level</label><select value={level} onChange={(e) => setNewLevel((p) => ({ ...p, [key]: e.target.value }))}><option value="">—</option>{levelOptions}</select></div>
              <div className="field"><label>Marks</label><input type="number" step="0.5" min={0} value={newMarks[key] || ""} onChange={(e) => setNewMarks((p) => ({ ...p, [key]: e.target.value }))} /></div>
            </div>
            {level && <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: -8, marginBottom: 12 }}><b>Suggested verbs for {level}:</b> {BLOOM_VERBS[level]}</p>}
            <button onClick={() => addItem(examType)} disabled={loading} className="btn btn-brass">{loading ? "Adding…" : "Add Question"}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {EXAM_TYPES.map((et) => renderSection(et, `${et} Paper`))}
      {legacyItems.length > 0 && renderSection(null, "Not Sorted Into an Exam Yet")}
    </>
  );
}
