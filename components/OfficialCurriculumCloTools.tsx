"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Copy = { id: string; label: string; courses: number; withClos: number };

// Super User, on an official curriculum: load CLOs from Excel, or adopt an institute's improved copy.
export default function OfficialCurriculumCloTools({ curriculumId }: { curriculumId: string }) {
  const router = useRouter();
  const [copies, setCopies] = useState<Copy[]>([]);
  const [fromId, setFromId] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/admin/curricula/${curriculumId}/adopt-from-copy`).then((r) => r.json()).then((d) => {
      const list: Copy[] = (d.copies || []).sort((a: Copy, b: Copy) => b.withClos - a.withClos);
      setCopies(list); setFromId(list[0]?.id || "");
    }).catch(() => {});
  }, [curriculumId]);

  async function upload(file: File) {
    if (!confirm("For every course in the file, the official CLOs will be replaced by the ones in the file. Continue?")) return;
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/admin/curricula/${curriculumId}/import-clos`, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: `${d.clos} CLO(s) loaded for ${d.courses} course(s).${d.errors?.length ? " Problems: " + d.errors.join("; ") : ""}` } : { ok: false, text: d.error || "Import failed." });
    setBusy(false); if (input.current) input.current.value = "";
    if (r.ok) router.refresh();
  }
  async function adopt() {
    const c = copies.find((x) => x.id === fromId);
    if (!c || !confirm(`Copy the CLOs and PLO mapping of "${c.label}" into this official curriculum${onlyEmpty ? " (only courses that have no CLOs yet)" : " (replacing the official CLOs of every course that copy has CLOs for)"}?`)) return;
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/admin/curricula/${curriculumId}/adopt-from-copy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId, onlyEmpty }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: `${d.clos} CLO(s) copied into ${d.courses} course(s)${d.keptOwn ? `; ${d.keptOwn} course(s) kept their own CLOs` : ""}${d.topicsCopied ? `; lecture topics added to ${d.topicsCopied}` : ""}${d.missing?.length ? `. Not in the official curriculum: ${d.missing.join(", ")}` : "."}` } : { ok: false, text: d.error || "Copy failed." });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  return (
    <div className="card" style={{ borderColor: "var(--brass)" }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Improve this official curriculum for every institute</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -4 }}>
        New institutes receive the official curriculum as it is. Institutes that already have their own copy can bring these changes in with &quot;Get updates from the official curriculum&quot; on their Master Curriculum page.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <b style={{ fontSize: 13 }}>From Excel:</b>
        <button className="btn btn-brass" disabled={busy} onClick={() => input.current?.click()}>Import CLOs &amp; PLO mapping from Excel</button>
        <input ref={input} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <span style={{ fontSize: 12, color: "var(--slate)" }}>Columns: Course code, CLO, Statement, Bloom level, Mapped PLO</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>From an institute&apos;s copy:</b>
        {copies.length === 0 ? <span style={{ fontSize: 12.5, color: "var(--slate)" }}>No institute has a copy of this curriculum yet.</span> : <>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} style={{ padding: "6px 8px", minWidth: 320 }}>
            {copies.map((c) => <option key={c.id} value={c.id}>{c.label} — {c.withClos} of {c.courses} courses with CLOs</option>)}
          </select>
          <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> Only fill official courses that have no CLOs</label>
          <button className="btn" disabled={busy || !fromId} onClick={adopt}>{busy ? "Working…" : "Copy into the official curriculum"}</button>
        </>}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.ok ? "var(--sage)" : "#b3261e" }}>{msg.text}</div>}
    </div>
  );
}
