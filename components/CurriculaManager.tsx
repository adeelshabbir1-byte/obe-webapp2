"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Curriculum = { id: string; authority: string; title: string; version: string; courseCount: number; ploCount: number };

export default function CurriculaManager({ initialCurricula }: { initialCurricula: Curriculum[] }) {
  const router = useRouter();
  const [curricula, setCurricula] = useState<Curriculum[]>(initialCurricula);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState("");

  async function doClone(e: React.FormEvent<HTMLFormElement>, sourceId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/curricula/${sourceId}/clone`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newVersion: fd.get("newVersion") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCurricula((prev) => [...prev, { ...data.curriculum, courseCount: 0, ploCount: 0 }]);
      setCloningId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function createBlank(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/curricula", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority: fd.get("authority"), title: fd.get("title"), version: fd.get("version") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCurricula((prev) => [...prev, { ...data.curriculum, courseCount: 0, ploCount: 0 }]);
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function deleteCurriculum(id: string, title: string, courseCount: number) {
    const confirmMsg = courseCount > 0
      ? `Delete "${title}" and its ${courseCount} course(s)? This cannot be undone. Any real courses already adopted from it stay untouched, just losing their traceability link.`
      : `Delete "${title}"? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCurricula((prev) => prev.filter((c) => c.id !== id));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function uploadPdf(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(""); setUploadResult("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/curricula/upload-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setUploadResult(data.message); setLoading(false);
      setTimeout(() => router.push(`/admin/curricula/${data.curriculumId}`), 1800);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <SortableTable>
          <thead><tr><th>Authority</th><th>Title</th><th>Version</th><th>Courses</th><th>PLOs</th><th></th></tr></thead>
          <tbody>
            {curricula.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No curricula yet.</td></tr>}
            {curricula.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td>{c.authority}</td><td>{c.title}</td><td>{c.version}</td><td>{c.courseCount}</td><td>{c.ploCount}</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    <a href={`/admin/curricula/${c.id}`} style={{ color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline" }}>Edit</a>
                    <button onClick={() => setCloningId(cloningId === c.id ? null : c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      {cloningId === c.id ? "Cancel" : "Clone as New Version"}
                    </button>
                    <button onClick={() => deleteCurriculum(c.id, c.title, c.courseCount)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      Delete
                    </button>
                  </td>
                </tr>
                {cloningId === c.id && (
                  <tr>
                    <td colSpan={6}>
                      <form onSubmit={(e) => doClone(e, c.id)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
                        <span style={{ fontSize: 12 }}>New version label:</span>
                        <input name="newVersion" placeholder="2027" style={{ padding: "6px 8px", border: "1px solid var(--line)", width: 120 }} required />
                        <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Clone</button>
                        <span style={{ fontSize: 11, color: "var(--slate)" }}>Copies all courses & PLOs — edit the copy afterward.</span>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Create a Curriculum from Scratch</h3>
        <form onSubmit={createBlank}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 14 }}>
            <div className="field"><label>Authority</label><input name="authority" placeholder="HEC" required /></div>
            <div className="field"><label>Title</label><input name="title" placeholder="BS Software Engineering" required /></div>
            <div className="field"><label>Version</label><input name="version" placeholder="2025" required /></div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Curriculum"}</button>
        </form>
      </div>

      <div className="card" style={{ borderColor: "var(--brass)" }}>
        <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--brass-dark)" }}>Upload a Curriculum PDF</h3>
        <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
          Extraction is best-effort — course codes, titles, and credit hours are auto-detected where the
          PDF's formatting allows, but this always needs your review afterward in the curriculum editor
          before publishing. Different institutions format these documents differently, so results vary.
        </p>
        {uploadResult && <div style={{ background: "#CCFBF1", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{uploadResult} Redirecting to the editor…</div>}
        <form onSubmit={uploadPdf}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 14 }}>
            <div className="field"><label>Authority</label><input name="authority" placeholder="e.g. University of the Punjab" required /></div>
            <div className="field"><label>Program Title</label><input name="title" placeholder="BS Computer Science" required /></div>
            <div className="field"><label>Version</label><input name="version" placeholder="2026" required /></div>
          </div>
          <div className="field"><label>PDF File</label><input name="file" type="file" accept="application/pdf" required /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Uploading & Parsing…" : "Upload & Parse"}</button>
        </form>
      </div>
    </>
  );
}
