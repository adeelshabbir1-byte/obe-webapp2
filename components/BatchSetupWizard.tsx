"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseBoard } from "./BatchBoard";
import type { Board, SourceRow } from "../lib/batchBoard";

// A new batch, one step at a time on one page: 1 batch · 2 where the courses come from (ONE source: a curriculum or a
// previous batch, never mixed) · 3 tracks (curricula with specialisation tracks) · 4 preview → create.

type Program = { name: string; shortCode: string };
const get = async (u: string) => { const r = await fetch(u); return r.json().catch(() => ({})); };
const post = async (u: string, body: unknown) => { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d; };

export default function BatchSetupWizard({ programs, existing }: { programs: Program[]; existing: { id: string; degreeProgram: string; batchName: string } | null }) {
  const router = useRouter();
  const year0 = new Date().getFullYear();
  const [step, setStep] = useState(existing ? 2 : 1);
  const [program, setProgram] = useState(existing?.degreeProgram || programs[0]?.name || "");
  const [term, setTerm] = useState("Fall");
  const [year, setYear] = useState(String(year0));
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [src, setSrc] = useState<SourceRow | null>(null);
  const [tracks, setTracks] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [board, setBoard] = useState<Board | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { if (step === 2 && program) { setSources(null); get(`/api/coordinator/batch-setup?sources=${encodeURIComponent(program)}`).then((d) => setSources(d.rows || [])); } }, [step, program]);
  async function chooseSource(r: SourceRow) {
    setSrc(r); setErr(""); setBoard(null);
    const t = r.kind === "CURRICULUM" ? ((await get(`/api/coordinator/batch-setup?tracks=${r.id}`)).tracks || []) : [];
    setTracks(t); setPicked(new Set());
    setStep(t.length ? 3 : 4);
    if (!t.length) loadPreview(r);
  }
  async function loadPreview(r: SourceRow) { setBoard((await get(`/api/coordinator/batch-setup?preview=${r.kind === "CURRICULUM" ? "c" : "b"}:${r.id}`)).board || null); }

  async function create() {
    if (!src) return;
    setErr("");
    try {
      let batchId = existing?.id || "";
      if (!batchId) {
        setBusy("Creating the batch…");
        const p = programs.find((x) => x.name === program)!;
        const d = await post("/api/coordinator/batches", { degreeProgram: program, batchName: `${p.shortCode} ${term} ${year}`, startTerm: term, startYear: year });
        batchId = d.batch.id;
      }
      setBusy("Bringing in the courses…");
      if (src.kind === "CURRICULUM") await post("/api/coordinator/courses/import-hec", { batchId, curriculumId: src.id });
      else { let cursor: string | undefined; for (let i = 0; i < 200; i++) { const d = await post("/api/coordinator/courses/copy-from-batch", { sourceBatchId: src.id, targetBatchId: batchId, cursor }); cursor = d.nextCursor; if (!d.mightHaveMore || !cursor) break; } }
      if (picked.size) await post("/api/coordinator/batch-setup", { action: "tracks", batchId, tracks: tracks.filter((t) => picked.has(t.id)) });
      // Steps 2–4 are done; the guided set-up goes on with the next open step (usually 5, sync & equalise).
      router.push(`/coordinator/batches/${batchId}/setup`);
    } catch (e) { setErr((e as Error).message); setBusy(""); }
  }

  const stepBox = (n: number, title: string, body: React.ReactNode, summary?: string) => (
    <section className="card" style={{ opacity: step < n ? 0.5 : 1 }}>
      <h3 style={{ marginTop: 0, display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 24, height: 24, borderRadius: 999, background: step > n ? "#2E7D32" : "#0D2A4A", color: "#fff", display: "inline-grid", placeItems: "center", fontSize: 13 }}>{step > n ? "✓" : n}</span>{title}
        {step > n && summary && <span className="small-note" style={{ margin: 0, fontWeight: 400 }}>{summary} · <a role="button" onClick={() => setStep(n)}>change</a></span>}</h3>
      {step === n && body}
    </section>
  );
  const curricula = (sources || []).filter((r) => r.kind === "CURRICULUM"), batches = (sources || []).filter((r) => r.kind === "BATCH");
  const row = (r: SourceRow) => (
    <button key={r.id} type="button" onClick={() => chooseSource(r)} className="card" style={{ textAlign: "left", margin: 0, cursor: "pointer", border: src?.id === r.id ? "2px solid #0D2A4A" : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: r.badgeColor, borderRadius: 999, padding: "1px 8px", marginRight: 6 }}>{r.badge}</span><b>{r.name}</b>{r.isNew && <span style={{ fontSize: 11, fontWeight: 700, color: "#1E6B34", marginLeft: 6 }}>New</span>}
      <div className="small-note" style={{ margin: "4px 0 0" }}>{r.ch} CH · {r.courses} courses{r.listPool ? ` · + ${r.listPool} elective / IDS options` : ""}{r.basedOn ? ` · ${r.basedOn}` : ""}{r.usedBy.length ? ` · used by ${r.usedBy.slice(0, 3).join(", ")}` : ""}</div>
    </button>
  );

  return (
    <div>
      {err && <p className="err">{err}</p>}
      {stepBox(1, "Batch", (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>Program<br /><select value={program} onChange={(e) => setProgram(e.target.value)}>{programs.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
          <label>Intake<br /><select value={term} onChange={(e) => setTerm(e.target.value)}><option>Fall</option><option>Spring</option></select></label>
          <label>Year<br /><input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 90 }} /></label>
          <button type="button" className="btn" disabled={!program || !year} onClick={() => setStep(2)}>Next →</button>
          {!programs.length && <span className="small-note">Add your degree program on the Batches page first.</span>}
        </div>
      ), existing ? `${existing.degreeProgram} — ${existing.batchName}` : `${program} · ${term} ${year}`)}
      {stepBox(2, "Where do the courses come from? (choose one)", sources === null ? <p className="small-note">Loading…</p> : (
        <div style={{ display: "grid", gap: 12 }}>
          <div><b>A curriculum</b> <span className="small-note">— NCEAC / HEC versions and the university&apos;s own; newest first</span><div style={{ display: "grid", gap: 6, marginTop: 6 }}>{curricula.map(row)}{!curricula.length && <span className="small-note">No curriculum of this program&apos;s discipline yet.</span>}</div></div>
          <div><b>A previous batch</b> <span className="small-note">— exactly as it was taught</span><div style={{ display: "grid", gap: 6, marginTop: 6 }}>{batches.map(row)}{!batches.length && <span className="small-note">No earlier batch of this program.</span>}</div></div>
        </div>
      ), src?.name)}
      {tracks.length > 0 && stepBox(3, "Tracks this batch offers", (
        <div>
          <p className="small-note" style={{ marginTop: 0 }}>Tick one or several. Each track&apos;s elective list is the pool its students choose from.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 4 }}>{tracks.map((t) => <label key={t.id}><input type="checkbox" checked={picked.has(t.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} /> {t.name}</label>)}</div>
          <button type="button" className="btn" style={{ marginTop: 8 }} disabled={!picked.size} onClick={() => { setStep(4); if (src) loadPreview(src); }}>Next →</button>
        </div>
      ), `${picked.size} track(s): ${tracks.filter((t) => picked.has(t.id)).map((t) => t.name).join(", ")}`)}
      {stepBox(4, "Preview and create", (
        <div>
          {board ? <CourseBoard board={board} /> : <p className="small-note">Loading the preview…</p>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
            <button type="button" className="btn" disabled={!!busy || !src} onClick={create}>{busy || (existing ? "Bring these courses into the batch" : "Create batch with these courses")}</button>
            {src?.kind === "CURRICULUM" && <span className="small-note" style={{ margin: 0 }}>Next, on the batch&apos;s courses page: ① sync &amp; equalise · ② home department of new courses · ③ final names and codes.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
