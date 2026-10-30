"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogEntry, Overlap } from "../lib/catalogCore";

// Client pieces of a Course Catalog page: import into my course (with a preview), the editor (Super Admin /
// curriculum team), and the AI meaning check of overlaps.

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/course-catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Could not save.");
  return j;
}
const PARTS: [string, string][] = [["clos", "CLOs"], ["plan", "32-lecture plan (with importance and readings)"], ["prereqs", "Prerequisites"], ["books", "Books"]];
type Preview = {
  catalog: { code: string; version: number }; course: { code: string; title: string }; blocked: boolean; warnings: string[];
  clos: { code: string; now: string | null; next: string }[]; plan: { n: number; now: string | null; next: string }[];
  prereqs: { now: string | null; next: string[]; missing: string[] } | null; books: { now: string | null; next: string | null; refsNext: string | null } | null;
};

export function CatalogImport({ catalogId, targets }: { catalogId: string; targets: { id: string; label: string }[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(targets[0]?.id || "");
  const [parts, setParts] = useState<string[]>(["clos", "plan", "prereqs", "books"]);
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function preview() {
    setBusy(true); setMsg(null); setPv(null);
    try { setPv((await post({ action: "preview", courseId, catalogId, parts })).preview); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  async function apply() {
    if (!confirm("Import into this course? What you see under 'Will be' replaces the current text.")) return;
    setBusy(true); setMsg(null);
    try { const r = await post({ action: "import", courseId, catalogId, parts }); setMsg({ ok: true, text: `Imported — recorded as “${r.from}”.` }); setPv(null); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  const changed = pv ? pv.plan.filter((p) => p.now !== p.next).length : 0;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Into my course
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setPv(null); }} style={{ minWidth: 260 }}>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PARTS.map(([k, l]) => <label key={k} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={parts.includes(k)} onChange={(e) => { setParts((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k))); setPv(null); }} />{l}</label>)}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !courseId || !parts.length} onClick={preview}>{busy && !pv ? "…" : "Preview"}</button>
      </div>
      {msg && <p className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</p>}
      {pv && (
        <div style={{ marginTop: 10 }} data-testid="catalog-preview">
          {pv.warnings.map((w) => <p key={w} className="small-note" style={{ color: "#8A5A00", margin: "2px 0" }}>⚠ {w}</p>)}
          {pv.clos.length > 0 && <table className="table" style={{ width: "100%", fontSize: 12, marginTop: 6 }}><thead><tr><th>CLO</th><th>Now</th><th>Will be</th></tr></thead><tbody>{pv.clos.map((c) => <tr key={c.code}><td>{c.code}</td><td className="small-note">{c.now || "—"}</td><td>{c.next}</td></tr>)}</tbody></table>}
          {pv.plan.length > 0 && (
            <details style={{ marginTop: 6 }} open={changed <= 8}>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>Lecture plan — {changed} of 32 lectures change</summary>
              <table className="table" style={{ width: "100%", fontSize: 12 }}><thead><tr><th>L</th><th>Now</th><th>Will be</th></tr></thead><tbody>{pv.plan.map((p) => <tr key={p.n} style={{ background: p.now === p.next ? undefined : "#FFF8E6" }}><td>{p.n}</td><td className="small-note">{p.now || "—"}</td><td>{p.next}</td></tr>)}</tbody></table>
            </details>
          )}
          {pv.prereqs && <p style={{ fontSize: 13, margin: "6px 0" }}><b>Prerequisites:</b> now {pv.prereqs.now || "none"} → {pv.prereqs.next.join(", ") || "none found in this batch"}{pv.prereqs.missing.length ? <span className="small-note"> (not in this batch: {pv.prereqs.missing.join(", ")})</span> : null}. An existing prerequisite is kept.</p>}
          {pv.books && <p style={{ fontSize: 13, margin: "6px 0", whiteSpace: "pre-line" }}><b>Text book:</b> {pv.books.next || "—"}{pv.books.refsNext ? `\nReferences: ${pv.books.refsNext}` : ""}</p>}
          <button type="button" className="btn btn-brass btn-sm" disabled={busy || pv.blocked} onClick={apply}>{busy ? "Importing…" : `Import from ${pv.catalog.code} v${pv.catalog.version}`}</button>
        </div>
      )}
    </div>
  );
}

export function AiOverlapCheck({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ list: Overlap[]; ai: boolean } | null>(null);
  const [err, setErr] = useState("");
  async function go() { setBusy(true); setErr(""); try { setRes(await post({ action: "aiOverlaps", code })); } catch (e) { setErr((e as Error).message); } setBusy(false); }
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={go} disabled={busy}>{busy ? "Checking…" : "Check by meaning with AI"}</button>
      {err && <span className="small-note" style={{ color: "var(--rust)" }}> {err}</span>}
      {res && (
        <div style={{ marginTop: 6 }}>
          {!res.ai && <p className="small-note">No AI model is set up for your institute — showing matches by wording.</p>}
          {res.list.length === 0 ? <p className="small-note">No overlaps.</p> : (
            <table className="table" style={{ width: "100%", fontSize: 12 }}><thead><tr><th>Kind</th><th>This / other topic</th><th>Why</th></tr></thead>
              <tbody>{res.list.map((o, i) => <tr key={i}><td>{o.kind === "DUPLICATION" ? "Duplication" : "Progression"}{o.by === "AI" ? " (AI)" : ""}</td><td>{o.a.code} L{o.a.lecture} {o.a.topic} ↔ {o.b.code} L{o.b.lecture} {o.b.topic}</td><td className="small-note">{o.reason}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const BLOOMS = ["C1", "C2", "C3", "C4", "C5", "C6", "P1", "P2", "P3", "P4", "P5", "A1", "A2", "A3"];
export function CatalogEditor({ entry, gaCount, codes }: { entry: CatalogEntry; gaCount: number; codes: { code: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [e, setE] = useState<CatalogEntry>(entry);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setE(entry); setOpen(true); }}>Edit this course</button>;
  const set = (p: Partial<CatalogEntry>) => setE((x) => ({ ...x, ...p }));
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await post({ action: "save", id: entry.id, note, patch: { title: e.title, discipline: e.discipline, semester: e.semester, semesterReason: e.semesterReason, creditHours: e.creditHours, theoryCh: e.theoryCh, labCh: e.labCh, clos: e.clos, lectures: e.lectures, prereqs: e.prereqs, books: e.books } });
      setMsg({ ok: true, text: `Saved as version ${r.version}.` }); setOpen(false); router.refresh();
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }
  const inp = { fontSize: 12, padding: "3px 5px" } as const;
  return (
    <div className="card" style={{ marginTop: 8 }} data-testid="catalog-editor">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 260px" }}>Title<input value={e.title} onChange={(x) => set({ title: x.target.value })} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Discipline<input value={e.discipline} onChange={(x) => set({ discipline: x.target.value })} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Semester<input type="number" min={1} max={8} value={e.semester ?? ""} onChange={(x) => set({ semester: Number(x.target.value) || null })} style={{ width: 70 }} /></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>CH / theory / lab<span style={{ display: "flex", gap: 4 }}>{(["creditHours", "theoryCh", "labCh"] as const).map((k) => <input key={k} type="number" min={0} max={6} value={e[k]} onChange={(x) => set({ [k]: Number(x.target.value) || 0 } as Partial<CatalogEntry>)} style={{ width: 52 }} />)}</span></label>
        <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 100%" }}>Why this semester<input value={e.semesterReason || ""} onChange={(x) => set({ semesterReason: x.target.value })} /></label>
      </div>
      <h3 style={{ fontSize: 14, margin: "10px 0 4px" }}>CLOs</h3>
      {e.clos.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <b style={{ fontSize: 12, width: 50 }}>CLO-{i + 1}</b>
          <input value={c.statement} onChange={(x) => set({ clos: e.clos.map((y, j) => (j === i ? { ...y, statement: x.target.value } : y)) })} style={{ ...inp, flex: "1 1 300px" }} />
          <select value={c.bloom} onChange={(x) => set({ clos: e.clos.map((y, j) => (j === i ? { ...y, bloom: x.target.value } : y)) })} style={inp}>{BLOOMS.map((b) => <option key={b}>{b}</option>)}</select>
          <input value={c.gas.join(", ")} title={`Graduate attributes 1–${gaCount}`} onChange={(x) => set({ clos: e.clos.map((y, j) => (j === i ? { ...y, gas: x.target.value.split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= gaCount) } : y)) })} style={{ ...inp, width: 70 }} placeholder="GAs" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ clos: e.clos.filter((_, j) => j !== i), lectures: e.lectures.map((l) => (l.clo === i + 1 ? { ...l, clo: null } : l.clo && l.clo > i + 1 ? { ...l, clo: l.clo - 1 } : l)) })}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ clos: [...e.clos, { n: e.clos.length + 1, statement: "", bloom: "C3", gas: [1], source: "OBEHUB reference" }] })}>+ CLO</button>
      <h3 style={{ fontSize: 14, margin: "10px 0 4px" }}>Lecture plan (32)</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 12, width: "100%" }}>
          <thead><tr><th>L</th><th>Topic</th><th>Sub-topic</th><th>CLO</th><th>Importance</th><th>Chapter</th></tr></thead>
          <tbody>{e.lectures.map((l, i) => {
            const up = (p: Partial<typeof l>) => set({ lectures: e.lectures.map((y, j) => (j === i ? { ...y, ...p } : y)) });
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input value={l.topic} onChange={(x) => up({ topic: x.target.value })} style={{ ...inp, width: "100%", minWidth: 180 }} /></td>
                <td><input value={l.sub} onChange={(x) => up({ sub: x.target.value })} style={{ ...inp, width: "100%", minWidth: 140 }} /></td>
                <td><select value={l.clo ?? ""} onChange={(x) => up({ clo: Number(x.target.value) || null })} style={inp}><option value="">—</option>{e.clos.map((_, k) => <option key={k} value={k + 1}>CLO-{k + 1}</option>)}</select></td>
                <td><select value={l.importance} onChange={(x) => up({ importance: x.target.value as typeof l.importance })} style={inp}><option value="CORE">Core</option><option value="IMPORTANT">Important</option><option value="OPTIONAL">Optional</option></select></td>
                <td><input value={l.chapter || ""} onChange={(x) => up({ chapter: x.target.value || null })} style={{ ...inp, width: 80 }} /></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <h3 style={{ fontSize: 14, margin: "10px 0 4px" }}>Prerequisites</h3>
      {e.prereqs.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
          <select value={p.code || ""} onChange={(x) => { const c = codes.find((y) => y.code === x.target.value); set({ prereqs: e.prereqs.map((y, j) => (j === i ? { ...y, code: c?.code || null, title: c?.title || y.title } : y)) }); }} style={{ ...inp, maxWidth: 320 }}><option value="">{p.title} (not in catalog)</option>{codes.map((c) => <option key={c.code} value={c.code}>{c.code} {c.title}</option>)}</select>
          <select value={p.strength} onChange={(x) => set({ prereqs: e.prereqs.map((y, j) => (j === i ? { ...y, strength: x.target.value as typeof p.strength } : y)) })} style={inp}><option value="STRONG">Strong</option><option value="MILD">Mild</option><option value="WEAK">Weak</option></select>
          <input value={p.reason} onChange={(x) => set({ prereqs: e.prereqs.map((y, j) => (j === i ? { ...y, reason: x.target.value } : y)) })} style={{ ...inp, flex: "1 1 220px" }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ prereqs: e.prereqs.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ prereqs: [...e.prereqs, { code: codes[0]?.code || null, title: codes[0]?.title || "", strength: "MILD", reason: "Curriculum team" }] })}>+ Prerequisite</button>
      <h3 style={{ fontSize: 14, margin: "10px 0 4px" }}>Books (first line: text book; then references)</h3>
      <textarea rows={4} style={{ width: "100%", fontSize: 12 }} value={e.books.map((b) => b.title).join("\n")} onChange={(x) => set({ books: x.target.value.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((t, i) => ({ title: t, kind: i ? "REFERENCE" : "TEXT" })) })} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="What changed (kept in the history)" style={{ flex: "1 1 260px" }} />
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save as new version"}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}
