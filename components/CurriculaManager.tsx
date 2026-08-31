"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

type Curriculum = { id: string; authority: string; title: string; version: string; courseCount: number; ploCount: number };

export default function CurriculaManager({ initialCurricula }: { initialCurricula: Curriculum[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);

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
      setCloningId(null); setLoading(false); router.refresh();
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
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Authority</th><th>Title</th><th>Version</th><th>Courses</th><th>PLOs</th><th></th></tr></thead>
          <tbody>
            {initialCurricula.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No curricula yet.</td></tr>}
            {initialCurricula.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td>{c.authority}</td><td>{c.title}</td><td>{c.version}</td><td>{c.courseCount}</td><td>{c.ploCount}</td>
                  <td style={{ display: "flex", gap: 10 }}>
                    <a href={`/admin/curricula/${c.id}`} style={{ color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline" }}>Edit</a>
                    <button onClick={() => setCloningId(cloningId === c.id ? null : c.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                      {cloningId === c.id ? "Cancel" : "Clone as New Version"}
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
        </table>
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
    </>
  );
}
