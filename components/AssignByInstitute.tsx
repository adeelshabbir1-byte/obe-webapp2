"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Institute = { id: string; label: string; assignedCount: number };
type Cur = { id: string; title: string; authority: string; version: string; degreeGroup: string; assigned: boolean };

export default function AssignByInstitute() {
  const router = useRouter();
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [instituteId, setInstituteId] = useState("");
  const [curricula, setCurricula] = useState<Cur[]>([]);
  const [saved, setSaved] = useState<string>(""); // snapshot of ticked ids, to know if anything changed
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/institute-curricula").then((r) => r.json()).then((d) => setInstitutes(d.institutes || [])).catch(() => setError("Could not load institutes."));
  }, []);

  const key = (list: Cur[]) => list.filter((c) => c.assigned).map((c) => c.id).sort().join(",");

  async function pick(id: string) {
    setInstituteId(id); setMsg(""); setError(""); setCurricula([]);
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/admin/institute-curricula?chairmanId=${id}`);
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(d.error || "Could not load curricula."); return; }
    setCurricula(d.curricula); setSaved(key(d.curricula));
  }

  async function save() {
    setLoading(true); setMsg(""); setError("");
    const res = await fetch("/api/admin/institute-curricula", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chairmanId: instituteId, curriculumIds: curricula.filter((c) => c.assigned).map((c) => c.id) }),
    });
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(d.error || "Could not save."); return; }
    setSaved(key(curricula));
    setInstitutes((prev) => prev.map((i) => (i.id === instituteId ? { ...i, assignedCount: d.total } : i)));
    setMsg(`Saved. This institute now has ${d.total} curricul${d.total === 1 ? "um" : "a"}` + (d.added ? ` (${d.added} added, each with its own editable copy)` : "") + (d.removed ? `, ${d.removed} removed` : "") + ".");
    router.refresh();
  }

  const toggle = (id: string) => setCurricula((prev) => prev.map((c) => (c.id === id ? { ...c, assigned: !c.assigned } : c)));
  const setGroup = (group: string, on: boolean) => setCurricula((prev) => prev.map((c) => (c.degreeGroup === group ? { ...c, assigned: on } : c)));
  const groups = Array.from(new Set(curricula.map((c) => c.degreeGroup)));
  const dirty = key(curricula) !== saved;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Give curricula to an institute</h3>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>1. Choose the institute. 2. Tick the curricula it should get. 3. Press Save.</p>

      <select value={instituteId} onChange={(e) => pick(e.target.value)} style={{ padding: "8px 10px", minWidth: 280 }}>
        <option value="">— choose an institute —</option>
        {institutes.map((i) => <option key={i.id} value={i.id}>{i.label} ({i.assignedCount} assigned)</option>)}
      </select>

      {error && <div style={{ color: "#b3261e", marginTop: 10 }}>{error}</div>}
      {instituteId && loading && curricula.length === 0 && <div style={{ marginTop: 10, color: "var(--slate)" }}>Loading…</div>}

      {curricula.length > 0 && (
        <>
          <div style={{ marginTop: 14 }}>
            {groups.map((g) => (
              <div key={g} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: "flex", gap: 10, alignItems: "baseline" }}>
                  {g}
                  <button type="button" onClick={() => setGroup(g, true)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0 }}>all</button>
                  <button type="button" onClick={() => setGroup(g, false)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 11.5, textDecoration: "underline", cursor: "pointer", padding: 0 }}>none</button>
                </div>
                {curricula.filter((c) => c.degreeGroup === g).map((c) => (
                  <label key={c.id} style={{ display: "block", fontSize: 13, padding: "2px 0 2px 14px" }}>
                    <input type="checkbox" checked={c.assigned} onChange={() => toggle(c.id)} /> {c.title} <span style={{ color: "var(--slate)" }}>— {c.authority} · v{c.version}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-brass" onClick={save} disabled={loading || !dirty}>{loading ? "Saving…" : "Save"}</button>
            <button className="btn" type="button" onClick={() => setCurricula((p) => p.map((c) => ({ ...c, assigned: true })))}>Tick all</button>
            <button className="btn" type="button" onClick={() => setCurricula((p) => p.map((c) => ({ ...c, assigned: false })))}>Clear all</button>
            {dirty && <span style={{ fontSize: 12, color: "#96650F" }}>Unsaved changes</span>}
            {msg && <span style={{ fontSize: 12.5, color: "var(--sage)" }}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
