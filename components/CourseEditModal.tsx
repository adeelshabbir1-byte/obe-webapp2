"use client";

import { useState } from "react";

type Clo = { id: string; statement: string; bloomLevel: string; orderIndex: number; mappedPloNumber: number | null; ploMappingSource: string | null };
type MCourse = { id: string; code: string; title: string; creditHours: number; category: string; domain: string | null; semesterNumber: number | null; textbook: string | null; catalogDescription: string | null; referenceMaterial: string | null; prerequisiteCourseId: string | null; prerequisiteCourseTitle: string | null; seedClos: Clo[]; suggestedPloNumbers: number[] };
type MPlo = { id: string; number: number; title: string; description: string };

const CATEGORIES = ["General Education", "Core", "Elective", "IDS", "Certification", "Capstone Project", "Field Experience"];
const BLOOM_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C6"];

// Every field here — including CLO→PLO mappings and the PLO-suggestion
// checkboxes — lives in this modal's own local state until "Save All
// Changes" is clicked. Nothing hits the server on a single click; you
// can freely check/uncheck several PLOs, remap several CLOs, and edit
// every course field, then commit it all in one action. CLO add/delete
// are the one exception, kept as immediate actions since they're
// structural (creating/removing a row) rather than a field edit.
export default function CourseEditModal({ course, plos, allCourses, onClose, onSaved, curriculumId }: {
  course: MCourse; plos: MPlo[]; allCourses: MCourse[]; curriculumId: string;
  onClose: () => void; onSaved: (courseId: string, patch: Partial<MCourse>) => void;
}) {
  const [code, setCode] = useState(course.code);
  const [title, setTitle] = useState(course.title);
  const [creditHours, setCreditHours] = useState(course.creditHours);
  const [category, setCategory] = useState(course.category);
  const [semesterNumber, setSemesterNumber] = useState(course.semesterNumber?.toString() ?? "");
  const [prerequisiteCourseId, setPrerequisiteCourseId] = useState(course.prerequisiteCourseId ?? "");
  const [textbook, setTextbook] = useState(course.textbook ?? "");
  const [referenceMaterial, setReferenceMaterial] = useState(course.referenceMaterial ?? "");
  const [catalogDescription, setCatalogDescription] = useState(course.catalogDescription ?? "");
  const [suggestedPloNumbers, setSuggestedPloNumbers] = useState<number[]>(course.suggestedPloNumbers);
  const [clos, setClos] = useState<Clo[]>(course.seedClos);
  const [cloPloEdits, setCloPloEdits] = useState<Record<string, string>>({}); // cloId -> ploId, only for ones changed locally

  const [newCloStatement, setNewCloStatement] = useState("");
  const [newCloBloom, setNewCloBloom] = useState("C2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function togglePloLocal(ploNumber: number) {
    setSuggestedPloNumbers((prev) => prev.includes(ploNumber) ? prev.filter((n) => n !== ploNumber) : [...prev, ploNumber]);
  }

  function cloPloValue(clo: Clo): string {
    if (clo.id in cloPloEdits) return cloPloEdits[clo.id];
    return plos.find((p) => p.number === clo.mappedPloNumber)?.id ?? "";
  }

  async function addClo() {
    if (!newCloStatement.trim()) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/${curriculumId}/courses/${course.id}/clos`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement: newCloStatement, bloomLevel: newCloBloom }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      const newClo: Clo = { id: data.clo.id, statement: data.clo.statement, bloomLevel: data.clo.bloomLevel, orderIndex: data.clo.orderIndex, mappedPloNumber: null, ploMappingSource: null };
      setClos((prev) => [...prev, newClo]);
      setNewCloStatement(""); setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  async function deleteClo(cloId: string) {
    setSaving(true); setError("");
    try {
      await fetch(`/api/admin/curricula/clos/${cloId}`, { method: "DELETE" });
      setClos((prev) => prev.filter((c) => c.id !== cloId));
      setCloPloEdits((prev) => { const next = { ...prev }; delete next[cloId]; return next; });
      setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  async function saveAll() {
    setSaving(true); setError("");
    try {
      // 1. Main course fields
      const payload = {
        code, title, creditHours: Number(creditHours), category,
        semesterNumber: semesterNumber ? Number(semesterNumber) : null,
        textbook: textbook || null, catalogDescription: catalogDescription || null, referenceMaterial: referenceMaterial || null,
        prerequisiteCourseId: prerequisiteCourseId || null,
      };
      const courseRes = await fetch(`/api/admin/curricula/${curriculumId}/courses/${course.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const courseData = await courseRes.json();
      if (!courseRes.ok) { setError(courseData.error || "Something went wrong saving course fields."); setSaving(false); return; }

      // 2. Any CLO→PLO remappings made locally
      const cloUpdates = Object.entries(cloPloEdits);
      for (const [cloId, ploId] of cloUpdates) {
        await fetch(`/api/admin/curricula/clos/${cloId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mappedPloId: ploId || null }),
        });
      }

      // 3. PLO suggestions, if changed
      if (JSON.stringify([...suggestedPloNumbers].sort()) !== JSON.stringify([...course.suggestedPloNumbers].sort())) {
        await fetch(`/api/admin/curricula/${curriculumId}/courses/${course.id}/plo-suggestions`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ploNumbers: suggestedPloNumbers }),
        });
      }

      const prereqTitle = payload.prerequisiteCourseId ? allCourses.find((c) => c.id === payload.prerequisiteCourseId)?.title ?? null : null;
      const finalClos = clos.map((clo) => {
        if (!(clo.id in cloPloEdits)) return clo;
        const ploId = cloPloEdits[clo.id];
        const ploNumber = ploId ? plos.find((p) => p.id === ploId)?.number ?? null : null;
        return { ...clo, mappedPloNumber: ploNumber, ploMappingSource: ploId ? "MANUAL" : null };
      });
      onSaved(course.id, { ...payload, prerequisiteCourseTitle: prereqTitle, seedClos: finalClos, suggestedPloNumbers });
      setSaving(false);
      onClose();
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 4, maxWidth: 780, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16 }}>Edit Course</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--slate)" }}>×</button>
        </div>

        {error && <div className="err">{error}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 100, padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
          <div>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Credits</label>
            <input type="number" value={creditHours} onChange={(e) => setCreditHours(Number(e.target.value))} style={{ width: 70, padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
          <div>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Semester</label>
            <input type="number" min={1} max={8} value={semesterNumber} onChange={(e) => setSemesterNumber(e.target.value)} placeholder="Sem" style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Prerequisite</label>
            <select value={prerequisiteCourseId} onChange={(e) => setPrerequisiteCourseId(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)" }}>
              <option value="">No prerequisite</option>
              {allCourses.filter((other) => other.id !== course.id).map((other) => <option key={other.id} value={other.id}>{other.title}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Textbook</label>
            <input value={textbook} onChange={(e) => setTextbook(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Reference Material</label>
            <input value={referenceMaterial} onChange={(e) => setReferenceMaterial(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)" }} />
          </div>
          <div style={{ flex: "1 1 100%" }}>
            <label style={{ fontSize: 10.5, color: "var(--slate)", display: "block" }}>Catalog Description / Outline</label>
            <textarea value={catalogDescription} onChange={(e) => setCatalogDescription(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", minHeight: 50 }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div>
            <h4 style={{ fontSize: 12, marginBottom: 6 }}>Seed CLOs</h4>
            {clos.map((clo) => {
              const sourceColor = clo.ploMappingSource === "HEC" ? "#F5E27A" : clo.ploMappingSource === "PU" ? "#B8E6B8" : clo.ploMappingSource === "SYSTEM" ? "#CFE3F5" : clo.ploMappingSource === "MANUAL" ? "#E0C6F0" : "#eee";
              return (
                <div key={clo.id} style={{ fontSize: 11.5, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <span><b>{clo.bloomLevel}</b> — {clo.statement}</span>
                    <button onClick={() => deleteClo(clo.id)} disabled={saving} style={{ fontSize: 10, padding: "1px 6px", border: "1px solid var(--line)", background: "#fff", flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <select
                      value={cloPloValue(clo)}
                      onChange={(e) => setCloPloEdits((prev) => ({ ...prev, [clo.id]: e.target.value }))}
                      style={{ fontSize: 10.5, padding: 2, background: sourceColor, border: "1px solid var(--line)" }}
                    >
                      <option value="">No PLO mapped</option>
                      {plos.map((p) => <option key={p.id} value={p.id}>PLO-{p.number}: {p.title}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
            {clos.length === 0 && <p style={{ fontSize: 11, color: "var(--slate)" }}>No seed CLOs yet.</p>}
            <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
              <select value={newCloBloom} onChange={(e) => setNewCloBloom(e.target.value)} style={{ fontSize: 11, padding: 3 }}>
                {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <input value={newCloStatement} onChange={(e) => setNewCloStatement(e.target.value)} placeholder="New CLO statement…" style={{ fontSize: 11, padding: 3, flex: 1 }} />
              <button onClick={addClo} disabled={saving} className="btn btn-brass" style={{ fontSize: 11, padding: "3px 10px" }}>Add</button>
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: 12, marginBottom: 6 }}>
              PLO suggestions <span style={{ fontWeight: 400, color: "var(--slate)" }}>(shared by course code across every curriculum using it)</span>
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {plos.map((p) => (
                <label key={p.id} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                  <input type="checkbox" checked={suggestedPloNumbers.includes(p.number)} onChange={() => togglePloLocal(p.number)} />
                  PLO-{p.number}
                </label>
              ))}
              {plos.length === 0 && <p style={{ fontSize: 11, color: "var(--slate)" }}>Add PLOs to this curriculum first.</p>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <button onClick={saveAll} disabled={saving} className="btn btn-brass">{saving ? "Saving…" : "Save All Changes"}</button>
          <button onClick={onClose} disabled={saving} className="btn" style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
