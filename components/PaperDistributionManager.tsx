"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LectureRow = { id: string; topic: string; cloId: string | null; bloomLevel: string | null };
type Clo = { id: string; code: string; statement: string };
type Item = {
  id: string; questionNo: number; lectureRowId: string | null; topicText: string;
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

export default function PaperDistributionManager({ apiBase, items, lectureRows, clos, coverageByTopic }: {
  apiBase: string; items: Item[]; lectureRows: LectureRow[]; clos: Clo[];
  coverageByTopic?: Record<string, { lectureCount: number; covered: boolean; deliveredMarksPct: number }>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newTopicSource, setNewTopicSource] = useState(""); // lectureRowId or ""
  const [newTopicText, setNewTopicText] = useState("");
  const [newCloId, setNewCloId] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [newMarks, setNewMarks] = useState("");

  function pickLectureRow(lectureRowId: string) {
    setNewTopicSource(lectureRowId);
    const row = lectureRows.find((r) => r.id === lectureRowId);
    if (row) {
      setNewTopicText(row.topic);
      setNewCloId(row.cloId || "");
      setNewLevel(row.bloomLevel || "");
    } else {
      setNewTopicText(""); setNewCloId(""); setNewLevel("");
    }
  }

  async function addItem() {
    if (!newTopicText.trim() || !newMarks) { setError("Topic and marks are required."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(apiBase, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lectureRowId: newTopicSource || null, topicText: newTopicText, cloId: newCloId || null, cognitiveLevel: newLevel || null, marks: newMarks }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setNewTopicSource(""); setNewTopicText(""); setNewCloId(""); setNewLevel(""); setNewMarks("");
      setLoading(false); router.refresh();
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
      setEditingId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeItem(itemId: string) {
    setLoading(true);
    await fetch(`${apiBase}/${itemId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function moveItem(itemId: string, direction: "up" | "down") {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/${itemId}/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
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

  const totalMarks = items.reduce((s, i) => s + i.marks, 0);
  const byLevel = new Map<string, number>();
  for (const i of items) if (i.cognitiveLevel) byLevel.set(i.cognitiveLevel, (byLevel.get(i.cognitiveLevel) || 0) + i.marks);

  const cloOptions = (
    <>
      <option value="">— No CLO —</option>
      {clos.map((c) => <option key={c.id} value={c.id}>{c.code}: {c.statement.slice(0, 40)}</option>)}
    </>
  );
  const levelOptions = Object.keys(BLOOM_VERBS).map((k) => <option key={k} value={k}>{k}</option>);

  return (
    <>
      {error && <div className="err">{error}</div>}

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
            {items.length === 0 && <tr><td colSpan={coverageByTopic ? 8 : 7} style={{ color: "var(--slate)" }}>No questions added yet.</td></tr>}
            {items.map((it, i) => (
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
                      <button onClick={() => moveItem(it.id, "up")} disabled={loading || i === 0} style={{ background: "none", border: "1px solid var(--line)", cursor: i === 0 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                      <button onClick={() => moveItem(it.id, "down")} disabled={loading || i === items.length - 1} style={{ background: "none", border: "1px solid var(--line)", cursor: i === items.length - 1 ? "default" : "pointer", fontSize: 9, padding: "0 3px", opacity: i === items.length - 1 ? 0.3 : 1 }}>▼</button>
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
                      <td style={!cov?.covered ? { background: "#FFE4DC", color: "var(--rust)", fontWeight: 700 } : { color: "var(--sage)" }}>
                        {cov ? `${cov.covered ? "Covered" : "Not Yet"} · ${cov.lectureCount} lec · ${Math.round(cov.deliveredMarksPct)}% delivered` : "No matching topic"}
                      </td>
                    );
                  })()}
                  <td style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setEditingId(it.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                    <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add a Question</h3>
        <div className="field">
          <label>Pick a Topic from the Lecture Plan (auto-fills CLO & level — optional)</label>
          <select value={newTopicSource} onChange={(e) => pickLectureRow(e.target.value)}>
            <option value="">— Type a custom topic instead —</option>
            {lectureRows.map((r) => <option key={r.id} value={r.id}>{r.topic}</option>)}
          </select>
        </div>
        <div className="field"><label>Topic / Question Text</label><input value={newTopicText} onChange={(e) => setNewTopicText(e.target.value)} placeholder="e.g. Binary Search Trees" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div className="field"><label>CLO</label><select value={newCloId} onChange={(e) => setNewCloId(e.target.value)}>{cloOptions}</select></div>
          <div className="field"><label>Cognitive Level</label><select value={newLevel} onChange={(e) => setNewLevel(e.target.value)}><option value="">—</option>{levelOptions}</select></div>
          <div className="field"><label>Marks</label><input type="number" step="0.5" min={0} value={newMarks} onChange={(e) => setNewMarks(e.target.value)} /></div>
        </div>
        {newLevel && <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: -8, marginBottom: 12 }}><b>Suggested verbs for {newLevel}:</b> {BLOOM_VERBS[newLevel]}</p>}
        <button onClick={addItem} disabled={loading} className="btn btn-brass">{loading ? "Adding…" : "Add Question"}</button>
      </div>
    </>
  );
}
