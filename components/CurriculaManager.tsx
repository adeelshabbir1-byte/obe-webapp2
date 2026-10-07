"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Curriculum = { id: string; authority: string; title: string; version: string; courseCount: number; ploCount: number; degreeGroup?: string; assignedCount?: number };
type Institute = { id: string; label: string; assigned: boolean };

export default function CurriculaManager({ initialCurricula }: { initialCurricula: Curriculum[] }) {
  const router = useRouter();
  const [curricula, setCurricula] = useState<Curriculum[]>(initialCurricula);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState("");

  // Assigning a curriculum to institutes
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [assignMsg, setAssignMsg] = useState("");

  async function openAssign(id: string) {
    if (assigningId === id) { setAssigningId(null); return; }
    setAssigningId(id); setAssignMsg(""); setInstitutes([]); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/${id}/access`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setInstitutes(data.institutes);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  async function saveAssign(id: string) {
    setLoading(true); setError(""); setAssignMsg("");
    try {
      const res = await fetch(`/api/admin/curricula/${id}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chairmanIds: institutes.filter((i) => i.assigned).map((i) => i.id) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCurricula((prev) => prev.map((c) => (c.id === id ? { ...c, assignedCount: data.assigned } : c)));
      setAssignMsg(`Saved - assigned to ${data.assigned} institute(s)` + (data.added ? `, ${data.added} newly added (each also gets its own editable copy)` : "") + (data.removed ? `, ${data.removed} removed` : "") + ".");
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

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
          <thead><tr><th>Authority</th><th>Title</th><th>Version</th><th>Courses</th><th>PLOs</th><th>Institutes</th><th></th></tr></thead>
          <tbody>
            {curricula.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No curricula yet.</td></tr>}
            {curricula.map((c, idx) => (
              <Fragment key={c.id}>
                {c.degreeGroup && (idx === 0 || curricula[idx - 1].degreeGroup !== c.degreeGroup) && (
                  <tr><td colSpan={7} style={{ background: "#F4EFE3", fontWeight: 700, fontSize: 12, letterSpacing: 0.4 }}>{c.degreeGroup}</td></tr>
                )}
                <tr>
                  <td>{c.authority}</td><td>{c.title}</td><td>{c.version}</td><td>{c.courseCount}</td><td>{c.ploCount}</td>
                  <td>{c.assignedCount ?? 0}</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => openAssign(c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0, fontWeight: 600 }}>
                      {assigningId === c.id ? "Close" : "Assign to Institutes"}
                    </button>
                    <Link href={`/admin/curricula/${c.id}`} style={{ color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline" }}>Edit</Link>
                    <button onClick={() => setCloningId(cloningId === c.id ? null : c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      {cloningId === c.id ? "Cancel" : "Clone as New Version"}
                    </button>
                    <button onClick={() => deleteCurriculum(c.id, c.title, c.courseCount)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      Delete
                    </button>
                  </td>
                </tr>
                {assigningId === c.id && (
                  <tr>
                    <td colSpan={7} style={{ background: "#FFFBF0" }}>
                      <div style={{ padding: "8px 0" }}>
                        <p style={{ fontSize: 12, marginBottom: 6 }}>Tick the institutes that should see and use <b>{c.title}</b> ({c.authority}, {c.version}). Newly ticked institutes also get their own editable copy. Un-ticking only stops offering it - an institute's own copy stays theirs.</p>
                        {institutes.length === 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>Loading institutes…</p>}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginBottom: 8 }}>
                          {institutes.map((i) => (
                            <label key={i.id} style={{ fontSize: 12.5 }}>
                              <input type="checkbox" checked={i.assigned} onChange={() => setInstitutes((prev) => prev.map((x) => (x.id === i.id ? { ...x, assigned: !x.assigned } : x)))} /> {i.label}
                            </label>
                          ))}
                        </div>
                        {institutes.length > 0 && (
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <button onClick={() => setInstitutes((prev) => prev.map((x) => ({ ...x, assigned: true })))} className="btn" style={{ fontSize: 11.5, padding: "3px 10px" }}>Select all</button>
                            <button onClick={() => setInstitutes((prev) => prev.map((x) => ({ ...x, assigned: false })))} className="btn" style={{ fontSize: 11.5, padding: "3px 10px" }}>Clear</button>
                            <button onClick={() => saveAssign(c.id)} disabled={loading} className="btn btn-brass" style={{ fontSize: 12, padding: "4px 14px" }}>{loading ? "Saving…" : "Save"}</button>
                            {assignMsg && <span style={{ fontSize: 12, color: "var(--sage)" }}>{assignMsg}</span>}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {cloningId === c.id && (
                  <tr>
                    <td colSpan={7}>
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
        {uploadResult && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{uploadResult} Redirecting to the editor…</div>}
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
