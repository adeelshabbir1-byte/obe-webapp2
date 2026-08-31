"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type MasterCourse = { id: string; code: string; title: string; creditHours: number; category: string; semesterNumber: number };
type MasterCurriculum = { id: string; authority: string; title: string; version: string; sourceReference: string | null; courses: MasterCourse[] };

export default function CreateCourseForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"manual" | "hec">("hec");
  const [curricula, setCurricula] = useState<MasterCurriculum[]>([]);
  const [selectedMasterCourseId, setSelectedMasterCourseId] = useState("");

  useEffect(() => {
    fetch("/api/master-curriculum")
      .then((r) => r.json())
      .then((d) => setCurricula(d.curricula || []))
      .catch(() => {});
  }, []);

  const hecCurriculum = curricula[0]; // seeded HEC BS Computer Science 2025

  async function onSubmitHec(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedMasterCourseId || !hecCurriculum) { setError("Pick a course from the HEC curriculum first."); return; }
    const mc = hecCurriculum.courses.find((c) => c.id === selectedMasterCourseId);
    if (!mc) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/coordinator/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mc.code, title: mc.title, creditHours: mc.creditHours, masterCourseId: mc.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setSelectedMasterCourseId(""); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function onSubmitManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Add a Course</h3>
      {hecCurriculum && (
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>
          Seeded from {hecCurriculum.authority} {hecCurriculum.title} ({hecCurriculum.version})
          {hecCurriculum.sourceReference ? ` — ${hecCurriculum.sourceReference}` : ""}
        </p>
      )}
      {error && <div className="err">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setMode("hec")} className="btn" style={mode === "hec" ? { background: "var(--brass)", borderColor: "var(--brass)" } : { background: "transparent", color: "var(--ink)" }}>
          Adopt from HEC Curriculum
        </button>
        <button type="button" onClick={() => setMode("manual")} className="btn" style={mode === "manual" ? { background: "var(--brass)", borderColor: "var(--brass)" } : { background: "transparent", color: "var(--ink)" }}>
          Enter Manually
        </button>
      </div>

      {mode === "hec" && (
        <form onSubmit={onSubmitHec}>
          <div className="field">
            <label>Course (Semester — Category)</label>
            <select value={selectedMasterCourseId} onChange={(e) => setSelectedMasterCourseId(e.target.value)} required>
              <option value="">— Select a course —</option>
              {hecCurriculum?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Sem {c.semesterNumber} — {c.title} ({c.creditHours} Cr, {c.category})
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading || !hecCurriculum}>
            {loading ? "Adding…" : "Adopt Course"}
          </button>
        </form>
      )}

      {mode === "manual" && (
        <form onSubmit={onSubmitManual}>
          <div className="field"><label>Course Code</label><input name="code" placeholder="MT 1103" required /></div>
          <div className="field"><label>Course Title</label><input name="title" placeholder="Discrete Structures" required /></div>
          <div className="field"><label>Credit Hours</label><input name="creditHours" type="number" placeholder="3" required /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Course"}</button>
        </form>
      )}
    </div>
  );
}
