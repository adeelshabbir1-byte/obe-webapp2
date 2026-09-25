"use client";

import { useState, useEffect, Fragment } from "react";

type CurriculumSummary = { id: string; title: string; authority: string; version: string; status: string; isOwned: boolean; _count: { courses: number; plos: number } };
type Clo = { id: string; statement: string; bloomLevel: string; orderIndex: number };
type MasterCourse = {
  id: string; code: string; title: string; creditHours: number; category: string; semesterNumber: number | null;
  textbook: string | null; catalogDescription: string | null; referenceMaterial: string | null;
  seedClos: Clo[]; suggestedPloNumbers: number[];
};
type Plo = { id: string; number: number; title: string; description: string };
type CurriculumDetail = { id: string; title: string; authority: string; version: string; status: string; sourceReference: string | null; isOwned: boolean; plos: Plo[]; courses: MasterCourse[] };

const CATEGORIES = ["General Education", "Major", "IDS", "Certification", "Capstone Project", "Field Experience"];
const BLOOM_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C6"];

export default function MasterCurriculumEditor() {
  const [curricula, setCurricula] = useState<CurriculumSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<CurriculumDetail | null>(null);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourse, setNewCourse] = useState({ code: "", title: "", creditHours: "3", category: "Major", semesterNumber: "" });

  useEffect(() => {
    fetch("/api/omc/master-curriculum").then((r) => r.json()).then((d) => { if (d.curricula) setCurricula(d.curricula); });
  }, []);

  async function loadDetail(id: string) {
    setSelectedId(id); setExpandedCourseId(null); setError(""); setNotice("");
    if (!id) { setDetail(null); return; }
    const res = await fetch(`/api/omc/master-curriculum/${id}`);
    const data = await res.json();
    if (data.curriculum) setDetail(data.curriculum);
  }

  async function saveCourseField(courseId: string, field: string, value: any) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/omc/master-curriculum/courses/${courseId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setBusy(false); await loadDetail(selectedId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function togglePlo(courseId: string, currentNumbers: number[], ploNumber: number) {
    const next = currentNumbers.includes(ploNumber) ? currentNumbers.filter((n) => n !== ploNumber) : [...currentNumbers, ploNumber];
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/omc/master-curriculum/courses/${courseId}/plo-suggestions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ploNumbers: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setBusy(false); await loadDetail(selectedId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function addClo(courseId: string, statement: string, bloomLevel: string) {
    if (!statement.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/omc/master-curriculum/courses/${courseId}/clos`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement, bloomLevel }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setBusy(false); await loadDetail(selectedId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function deleteClo(cloId: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/omc/master-curriculum/clos/${cloId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setBusy(false); await loadDetail(selectedId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function deleteCourse(courseId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/omc/master-curriculum/courses/${courseId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setBusy(false); setExpandedCourseId(null); await loadDetail(selectedId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function addCourse() {
    if (!newCourse.code.trim() || !newCourse.title.trim()) { setError("Code and title are required."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/omc/master-curriculum/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterCurriculumId: selectedId, ...newCourse, semesterNumber: newCourse.semesterNumber || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setShowAddCourse(false); setNewCourse({ code: "", title: "", creditHours: "3", category: "Major", semesterNumber: "" });
      setBusy(false); await loadDetail(selectedId);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function cloneCurriculum() {
    if (!selectedId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/omc/master-curriculum/${selectedId}/clone`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setNotice(`Cloned — ${data.coursesCloned} course(s), ${data.closCloned} CLO(s). Now editing your own copy.`);
      setBusy(false);
      const refreshed = await fetch("/api/omc/master-curriculum").then((r) => r.json());
      if (refreshed.curricula) setCurricula(refreshed.curricula);
      await loadDetail(data.curriculum.id);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 10 }}>
          Edits here change the shared HEC/standard-curriculum reference library — future imports and any course
          linked to one of these (via Content Sync or Course Equivalence's "HEC Course" column) will pick up
          changes made here. PLO suggestion checkboxes are what drives the yellow suggested cells and "Auto-map
          HEC" on the PLO-Course Matrix page.
        </p>
        <select value={selectedId} onChange={(e) => loadDetail(e.target.value)} style={{ fontSize: 13, padding: 6, minWidth: 320 }}>
          <option value="">Select a curriculum…</option>
          {curricula.map((c) => (
            <option key={c.id} value={c.id}>{c.title} ({c.authority} {c.version}) — {c._count.courses} courses {c.isOwned ? "— your copy" : ""}</option>
          ))}
        </select>
      </div>

      {error && <div className="err">{error}</div>}
      {notice && <div style={{ fontSize: 12, background: "#ECFBF4", border: "1px solid var(--sage)", padding: 6, marginBottom: 8 }}>{notice}</div>}

      {detail && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ fontSize: 15 }}>{detail.title} — {detail.plos.length} PLOs {detail.isOwned && <span style={{ fontSize: 11, color: "var(--sage)" }}>(your copy — editable)</span>}</h3>
            {detail.isOwned ? (
              <button onClick={() => setShowAddCourse(!showAddCourse)} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 10px" }}>
                {showAddCourse ? "Cancel" : "+ Add Course"}
              </button>
            ) : (
              <button onClick={cloneCurriculum} disabled={busy} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 10px" }}>
                Clone to make it editable
              </button>
            )}
          </div>
          {!detail.isOwned && (
            <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10, background: "#FFF3DC", padding: 8 }}>
              This is the shared official reference copy — read-only. Clone it to get your own editable version;
              future imports can then use your copy instead of the original, and any edits you make (including
              new PLO suggestions) are available for your institution going forward. Note: PLO suggestion
              checkboxes are keyed by course code and shared across every curriculum using that code — editing
              them here or on a clone updates the same underlying suggestion everywhere that code appears,
              including the official copy.
            </p>
          )}

          {showAddCourse && detail.isOwned && (
            <div style={{ background: "#F4F0FF", border: "1px solid var(--brass)", padding: 10, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><label style={{ fontSize: 10.5, display: "block" }}>Code</label><input value={newCourse.code} onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })} style={{ fontSize: 12, padding: 4, width: 100 }} /></div>
              <div><label style={{ fontSize: 10.5, display: "block" }}>Title</label><input value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} style={{ fontSize: 12, padding: 4, width: 220 }} /></div>
              <div><label style={{ fontSize: 10.5, display: "block" }}>Credit Hrs</label><input type="number" value={newCourse.creditHours} onChange={(e) => setNewCourse({ ...newCourse, creditHours: e.target.value })} style={{ fontSize: 12, padding: 4, width: 60 }} /></div>
              <div><label style={{ fontSize: 10.5, display: "block" }}>Category</label>
                <select value={newCourse.category} onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })} style={{ fontSize: 12, padding: 4 }}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={{ fontSize: 10.5, display: "block" }}>Semester #</label><input type="number" value={newCourse.semesterNumber} onChange={(e) => setNewCourse({ ...newCourse, semesterNumber: e.target.value })} style={{ fontSize: 12, padding: 4, width: 60 }} /></div>
              <button onClick={addCourse} disabled={busy} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 12px" }}>Create</button>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: 6 }}>Code</th><th style={{ padding: 6 }}>Title</th><th style={{ padding: 6 }}>Sem</th>
                <th style={{ padding: 6 }}>CLOs</th><th style={{ padding: 6 }}>PLO Suggestions</th><th></th>
              </tr>
            </thead>
            <tbody>
              {detail.courses.map((c) => {
                const isOpen = expandedCourseId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr style={{ fontSize: 12.5, borderTop: "1px solid var(--line)" }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{c.code}</td>
                      <td style={{ padding: 6 }}>{c.title}</td>
                      <td style={{ padding: 6 }}>{c.semesterNumber ?? "—"}</td>
                      <td style={{ padding: 6 }}>{c.seedClos.length}</td>
                      <td style={{ padding: 6 }}>{c.suggestedPloNumbers.length > 0 ? c.suggestedPloNumbers.sort((a, b) => a - b).join(", ") : <span style={{ color: "var(--slate)" }}>none</span>}</td>
                      <td style={{ padding: 6 }}>
                        <button onClick={() => setExpandedCourseId(isOpen ? null : c.id)} style={{ fontSize: 11, padding: "3px 8px", border: "1px solid var(--line)", background: "#fff" }}>
                          {isOpen ? "Close" : "Edit"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, background: "#F7F9FE" }}>
                          <CourseEditPanel
                            course={c} plos={detail.plos} busy={busy} isOwned={detail.isOwned}
                            onSaveField={saveCourseField} onTogglePlo={togglePlo} onAddClo={addClo} onDeleteClo={deleteClo} onDeleteCourse={deleteCourse}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CourseEditPanel({ course, plos, busy, isOwned, onSaveField, onTogglePlo, onAddClo, onDeleteClo, onDeleteCourse }: {
  course: MasterCourse; plos: Plo[]; busy: boolean; isOwned: boolean;
  onSaveField: (courseId: string, field: string, value: any) => void;
  onTogglePlo: (courseId: string, current: number[], ploNumber: number) => void;
  onAddClo: (courseId: string, statement: string, bloomLevel: string) => void;
  onDeleteClo: (cloId: string) => void;
  onDeleteCourse: (courseId: string) => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [creditHours, setCreditHours] = useState(String(course.creditHours));
  const [category, setCategory] = useState(course.category);
  const [textbook, setTextbook] = useState(course.textbook || "");
  const [newCloStatement, setNewCloStatement] = useState("");
  const [newCloBloom, setNewCloBloom] = useState("C2");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <h4 style={{ fontSize: 12, marginBottom: 8 }}>Basic fields</h4>
        <label style={{ fontSize: 10.5, display: "block" }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => onSaveField(course.id, "title", title)} disabled={!isOwned} style={{ fontSize: 12, padding: 4, width: "100%", marginBottom: 6 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <div>
            <label style={{ fontSize: 10.5, display: "block" }}>Credit Hrs</label>
            <input type="number" value={creditHours} onChange={(e) => setCreditHours(e.target.value)} onBlur={() => onSaveField(course.id, "creditHours", Number(creditHours))} disabled={!isOwned} style={{ fontSize: 12, padding: 4, width: 70 }} />
          </div>
          <div>
            <label style={{ fontSize: 10.5, display: "block" }}>Category</label>
            <select value={category} onChange={(e) => { setCategory(e.target.value); onSaveField(course.id, "category", e.target.value); }} disabled={!isOwned} style={{ fontSize: 12, padding: 4 }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <label style={{ fontSize: 10.5, display: "block" }}>Textbook</label>
        <input value={textbook} onChange={(e) => setTextbook(e.target.value)} onBlur={() => onSaveField(course.id, "textbook", textbook)} disabled={!isOwned} style={{ fontSize: 12, padding: 4, width: "100%", marginBottom: 10 }} />

        {isOwned && (
          <button onClick={() => { if (confirm(`Delete "${course.code}" from the master curriculum? This can't be undone.`)) onDeleteCourse(course.id); }} disabled={busy} style={{ fontSize: 11, padding: "3px 8px", border: "1px solid var(--rust)", background: "#fff", color: "var(--rust)" }}>
            Delete this course
          </button>
        )}

        <h4 style={{ fontSize: 12, marginTop: 14, marginBottom: 6 }}>PLO suggestions {!isOwned && <span style={{ fontWeight: 400, color: "var(--slate)" }}>(shared by course code — editable here too)</span>}</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {plos.map((p) => (
            <label key={p.id} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
              <input type="checkbox" checked={course.suggestedPloNumbers.includes(p.number)} disabled={busy} onChange={() => onTogglePlo(course.id, course.suggestedPloNumbers, p.number)} />
              PLO-{p.number}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 12, marginBottom: 8 }}>Seed CLOs</h4>
        {course.seedClos.map((clo) => (
          <div key={clo.id} style={{ fontSize: 11.5, padding: "4px 0", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 6 }}>
            <span><b>{clo.bloomLevel}</b> — {clo.statement}</span>
            {isOwned && <button onClick={() => onDeleteClo(clo.id)} style={{ fontSize: 10, padding: "1px 6px", border: "1px solid var(--line)", background: "#fff", flexShrink: 0 }}>✕</button>}
          </div>
        ))}
        {course.seedClos.length === 0 && <p style={{ fontSize: 11, color: "var(--slate)" }}>No seed CLOs yet.</p>}
        {isOwned && (
          <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
            <select value={newCloBloom} onChange={(e) => setNewCloBloom(e.target.value)} style={{ fontSize: 11, padding: 3 }}>
              {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input value={newCloStatement} onChange={(e) => setNewCloStatement(e.target.value)} placeholder="New CLO statement…" style={{ fontSize: 11, padding: 3, flex: 1 }} />
          <button onClick={() => { onAddClo(course.id, newCloStatement, newCloBloom); setNewCloStatement(""); }} disabled={busy} className="btn btn-brass" style={{ fontSize: 11, padding: "3px 10px" }}>Add</button>
        </div>
        )}
      </div>
    </div>
  );
}
