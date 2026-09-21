"use client";

import { useState, Fragment } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Clo = { id: string; statement: string; bloomLevel: string; orderIndex: number; mappedPloNumber: number | null; ploMappingSource: string | null };
type MCourse = { id: string; code: string; title: string; creditHours: number; category: string; semesterNumber: number | null; textbook: string | null; catalogDescription: string | null; referenceMaterial: string | null; prerequisiteCourseId: string | null; prerequisiteCourseTitle: string | null; seedClos: Clo[]; suggestedPloNumbers: number[] };
type MPlo = { id: string; number: number; title: string; description: string };

const CATEGORIES = ["General Education", "Core", "Elective", "IDS", "Certification", "Capstone Project", "Field Experience"];
const BLOOM_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C6"];

export default function CurriculumDetailManager({ curriculumId, courses, plos }: { curriculumId: string; courses: MCourse[]; plos: MPlo[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingPloId, setEditingPloId] = useState<string | null>(null);
  const [expandedClosCourseId, setExpandedClosCourseId] = useState<string | null>(null);
  const [newCloStatement, setNewCloStatement] = useState("");
  const [newCloBloom, setNewCloBloom] = useState("C2");

  async function addClo(courseId: string) {
    if (!newCloStatement.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}/clos`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement: newCloStatement, bloomLevel: newCloBloom }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setNewCloStatement(""); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function deleteClo(cloId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/clos/${cloId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function updateCloPlo(cloId: string, ploId: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/clos/${cloId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mappedPloId: ploId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function togglePlo(courseId: string, current: number[], ploNumber: number) {
    const next = current.includes(ploNumber) ? current.filter((n) => n !== ploNumber) : [...current, ploNumber];
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}/plo-suggestions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ploNumbers: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
          category: fd.get("category"), semesterNumber: fd.get("semesterNumber") || null,
          textbook: fd.get("textbook") || null, catalogDescription: fd.get("catalogDescription") || null, referenceMaterial: fd.get("referenceMaterial") || null,
          prerequisiteCourseId: fd.get("prerequisiteCourseId") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveCourseEdit(e: React.FormEvent<HTMLFormElement>, courseId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
          category: fd.get("category"), semesterNumber: fd.get("semesterNumber") || null,
          textbook: fd.get("textbook") || null, catalogDescription: fd.get("catalogDescription") || null, referenceMaterial: fd.get("referenceMaterial") || null,
          prerequisiteCourseId: fd.get("prerequisiteCourseId") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingCourseId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeCourse(courseId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/${curriculumId}/courses/${courseId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function addPlo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/plos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: fd.get("number"), title: fd.get("title"), description: fd.get("description") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function savePloEdit(e: React.FormEvent<HTMLFormElement>, ploId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/plos/${ploId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fd.get("title"), description: fd.get("description") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setEditingPloId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removePlo(ploId: string) {
    setLoading(true);
    await fetch(`/api/admin/curricula/${curriculumId}/plos/${ploId}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Courses ({courses.length})</h3>
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Category</th><th>Sem</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
            {courses.map((c) => editingCourseId === c.id ? (
              <tr key={c.id}>
                <td colSpan={6}>
                  <form onSubmit={(e) => saveCourseEdit(e, c.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <input name="code" defaultValue={c.code} style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="title" defaultValue={c.title} style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="creditHours" type="number" defaultValue={c.creditHours} style={{ width: 70, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <select name="category" defaultValue={c.category} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                      {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <input name="semesterNumber" type="number" min={1} max={8} defaultValue={c.semesterNumber ?? ""} style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} placeholder="Sem" />
                    <select name="prerequisiteCourseId" defaultValue={c.prerequisiteCourseId ?? ""} style={{ padding: "6px 8px", border: "1px solid var(--line)", minWidth: 160 }}>
                      <option value="">No prerequisite</option>
                      {courses.filter((other) => other.id !== c.id).map((other) => (
                        <option key={other.id} value={other.id}>{other.title}</option>
                      ))}
                    </select>
                    <input name="textbook" defaultValue={c.textbook ?? ""} placeholder="Textbook" style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} />
                    <input name="referenceMaterial" defaultValue={c.referenceMaterial ?? ""} placeholder="Reference material" style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} />
                    <textarea name="catalogDescription" defaultValue={c.catalogDescription ?? ""} placeholder="Catalog description / course outline" style={{ flex: "1 1 100%", padding: "6px 8px", border: "1px solid var(--line)", minHeight: 50 }} />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingCourseId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <Fragment key={c.id}>
                <tr>
                  <td>{c.code}</td>
                  <td>
                    {c.title}
                    {c.prerequisiteCourseTitle && <div style={{ fontSize: 10, color: "var(--slate)" }}>Prereq: {c.prerequisiteCourseTitle}</div>}
                  </td>
                  <td>{c.creditHours}</td><td>{c.category}</td><td>{c.semesterNumber ?? "—"}</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setEditingCourseId(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                    <button onClick={() => setExpandedClosCourseId(expandedClosCourseId === c.id ? null : c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      CLOs ({c.seedClos.length}) / PLOs ({c.suggestedPloNumbers.length})
                    </button>
                    <button onClick={() => removeCourse(c.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                  </td>
                </tr>
                {expandedClosCourseId === c.id && (
                  <tr>
                    <td colSpan={6} style={{ background: "#FAFAF8", padding: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        <div>
                          <h4 style={{ fontSize: 12, marginBottom: 6 }}>Seed CLOs</h4>
                          {c.seedClos.map((clo) => {
                            const sourceColor = clo.ploMappingSource === "HEC" ? "#F5E27A" : clo.ploMappingSource === "PU" ? "#B8E6B8" : clo.ploMappingSource === "SYSTEM" ? "#CFE3F5" : clo.ploMappingSource === "MANUAL" ? "#E0C6F0" : "#eee";
                            return (
                              <div key={clo.id} style={{ fontSize: 11.5, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                                  <span><b>{clo.bloomLevel}</b> — {clo.statement}</span>
                                  <button onClick={() => deleteClo(clo.id)} style={{ fontSize: 10, padding: "1px 6px", border: "1px solid var(--line)", background: "#fff", flexShrink: 0 }}>✕</button>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                  <select
                                    value={plos.find((p) => p.number === clo.mappedPloNumber)?.id ?? ""}
                                    disabled={loading}
                                    onChange={(e) => updateCloPlo(clo.id, e.target.value)}
                                    style={{ fontSize: 10.5, padding: 2, background: sourceColor, border: "1px solid var(--line)" }}
                                  >
                                    <option value="">No PLO mapped</option>
                                    {plos.map((p) => <option key={p.id} value={p.id}>PLO-{p.number}: {p.title}</option>)}
                                  </select>
                                  {clo.ploMappingSource && <span style={{ fontSize: 9.5, color: "var(--slate)" }}>({clo.ploMappingSource === "MANUAL" ? "set by you" : clo.ploMappingSource === "SYSTEM" ? "system-suggested" : `${clo.ploMappingSource}-sourced`})</span>}
                                </div>
                              </div>
                            );
                          })}
                          {c.seedClos.length === 0 && <p style={{ fontSize: 11, color: "var(--slate)" }}>No seed CLOs yet.</p>}
                          <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                            <select value={newCloBloom} onChange={(e) => setNewCloBloom(e.target.value)} style={{ fontSize: 11, padding: 3 }}>
                              {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <input value={newCloStatement} onChange={(e) => setNewCloStatement(e.target.value)} placeholder="New CLO statement…" style={{ fontSize: 11, padding: 3, flex: 1 }} />
                            <button onClick={() => addClo(c.id)} disabled={loading} className="btn btn-brass" style={{ fontSize: 11, padding: "3px 10px" }}>Add</button>
                          </div>
                        </div>
                        <div>
                          <h4 style={{ fontSize: 12, marginBottom: 6 }}>
                            PLO suggestions <span style={{ fontWeight: 400, color: "var(--slate)" }}>(shared by course code across every curriculum using it)</span>
                          </h4>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {plos.map((p) => (
                              <label key={p.id} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                                <input type="checkbox" checked={c.suggestedPloNumbers.includes(p.number)} disabled={loading} onChange={() => togglePlo(c.id, c.suggestedPloNumbers, p.number)} />
                                PLO-{p.number}
                              </label>
                            ))}
                            {plos.length === 0 && <p style={{ fontSize: 11, color: "var(--slate)" }}>Add PLOs to this curriculum first.</p>}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add Course</h3>
        <form onSubmit={addCourse}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 12 }}>
            <div className="field"><label>Code</label><input name="code" required /></div>
            <div className="field"><label>Title</label><input name="title" required /></div>
            <div className="field"><label>Credits</label><input name="creditHours" type="number" required /></div>
            <div className="field"><label>Category</label><select name="category" required>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="field"><label>Semester</label><input name="semesterNumber" type="number" min={1} max={8} /></div>
            <div className="field"><label>Prerequisite</label>
              <select name="prerequisiteCourseId" defaultValue="">
                <option value="">No prerequisite</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
            <div className="field"><label>Textbook (optional)</label><input name="textbook" /></div>
            <div className="field"><label>Reference Material (optional)</label><input name="referenceMaterial" /></div>
          </div>
          <div className="field"><label>Catalog Description / Course Outline (optional)</label><textarea name="catalogDescription" style={{ width: "100%", minHeight: 60, padding: "6px 8px", border: "1px solid var(--line)" }} /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add Course"}</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>PLOs ({plos.length})</h3>
        <SortableTable>
          <thead><tr><th>#</th><th>Title</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {plos.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No PLOs yet.</td></tr>}
            {plos.map((p) => editingPloId === p.id ? (
              <tr key={p.id}>
                <td colSpan={4}>
                  <form onSubmit={(e) => savePloEdit(e, p.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600 }}>PLO-{p.number}</span>
                    <input name="title" defaultValue={p.title} style={{ flex: "1 1 160px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="description" defaultValue={p.description} style={{ flex: "2 1 260px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingPloId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td>PLO-{p.number}</td><td>{p.title}</td><td>{p.description}</td>
                <td style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingPloId(p.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit</button>
                  <button onClick={() => removePlo(p.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add PLO</h3>
        <form onSubmit={addPlo}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
            <div className="field"><label>Number</label><input name="number" type="number" required /></div>
            <div className="field"><label>Title</label><input name="title" required /></div>
          </div>
          <div className="field"><label>Description</label><input name="description" required /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Adding…" : "Add PLO"}</button>
        </form>
      </div>
    </>
  );
}
