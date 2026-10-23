"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type S = { id: string; name: string; rollNumber: string; status: string; batch: { degreeProgram: string; batchName: string }; cgpa?: number | null };

/**
 * Find a student quickly: suggestions as you type (roll number or name), or choose a batch and pick from the list.
 * With a student open, Previous / Next (or the ← → keys) move through the same batch, keeping the rest of the page's
 * settings (tab etc.). `template` = "/prediction/student/{id}" for pages that take the id in the path; otherwise the
 * id goes into the `param` query parameter (default studentId).
 */
export default function StudentPicker({ current, param = "studentId", template, label = "Find a student" }: { current?: string | null; param?: string; template?: string; label?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<S[]>([]);
  const [hit, setHit] = useState(0);
  const [batches, setBatches] = useState<{ id: string; label: string; n: number }[]>([]);
  const [batch, setBatch] = useState("");
  const [list, setList] = useState<S[]>([]);
  const [ring, setRing] = useState<{ list: S[]; index: number } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (id: string) => {
    if (template) { router.push(template.replace("{id}", id)); return; }
    const u = new URLSearchParams(sp.toString()); u.set(param, id); u.delete("q");
    router.push(`${path}?${u.toString()}`);
  };
  useEffect(() => { fetch("/api/students/pick?batches=1").then((r) => r.json()).then((d) => setBatches(d.batches || [])).catch(() => null); }, []);
  useEffect(() => { if (!current) { setRing(null); return; } fetch(`/api/students/pick?around=${current}`).then((r) => r.json()).then((d) => setRing(d.students?.length ? { list: d.students, index: d.index } : null)).catch(() => null); }, [current]);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (q.trim().length < 2) { setHits([]); return; }
    t.current = setTimeout(() => { fetch(`/api/students/pick?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((d) => { setHits(d.students || []); setHit(0); }).catch(() => null); }, 200);
  }, [q]);
  useEffect(() => { if (!batch) { setList([]); return; } fetch(`/api/students/pick?batchId=${batch}&cgpa=1`).then((r) => r.json()).then((d) => setList(d.students || [])).catch(() => null); }, [batch]);
  // ← → move to the previous / next student of the batch (not while typing).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!ring || (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.key === "ArrowLeft" && ring.index > 0) go(ring.list[ring.index - 1].id);
      if (e.key === "ArrowRight" && ring.index < ring.list.length - 1) go(ring.list[ring.index + 1].id);
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const row = (s: S) => <>{s.rollNumber} · <b>{s.name}</b> <span style={{ color: "var(--slate)", fontSize: 11.5 }}>· {s.batch.degreeProgram} {s.batch.batchName}{s.status !== "ACTIVE" ? ` · ${s.status.toLowerCase()}` : ""}{s.cgpa != null ? ` · CGPA ${s.cgpa.toFixed(2)}` : ""}</span></>;

  return (
    <div className="card no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ position: "relative", flex: "1 1 280px" }}>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</label>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type roll number or name, e.g. 2510" style={{ width: "100%" }} aria-autocomplete="list"
          onKeyDown={(e) => { if (!hits.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setHit((hit + 1) % hits.length); } if (e.key === "ArrowUp") { e.preventDefault(); setHit((hit - 1 + hits.length) % hits.length); } if (e.key === "Enter") { e.preventDefault(); go(hits[hit].id); setQ(""); } if (e.key === "Escape") setQ(""); }} />
        {hits.length > 0 && (
          <div role="listbox" style={{ position: "absolute", zIndex: 30, left: 0, right: 0, background: "var(--card, #fff)", border: "1px solid var(--line, #ddd)", borderRadius: 6, maxHeight: 320, overflowY: "auto", boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
            {hits.map((s, i) => <div key={s.id} role="option" aria-selected={i === hit} onMouseEnter={() => setHit(i)} onMouseDown={() => { go(s.id); setQ(""); }} style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", background: i === hit ? "rgba(21,101,192,.1)" : undefined }}>{row(s)}</div>)}
          </div>
        )}
        {q.trim().length >= 2 && !hits.length && <div className="small-note">No student matches — check the roll number, or choose the batch.</div>}
      </div>
      <div style={{ flex: "1 1 240px" }}>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>…or open a whole batch</label>
        <select className="input" value={batch} onChange={(e) => setBatch(e.target.value)} style={{ width: "100%" }}>
          <option value="">— choose a batch —</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.label} ({b.n})</option>)}
        </select>
      </div>
      {ring && ring.index >= 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", alignSelf: "flex-end" }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={ring.index <= 0} onClick={() => go(ring.list[ring.index - 1].id)} title="Previous student (←)">← Previous</button>
          <span className="small-note">{ring.index + 1} of {ring.list.length}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={ring.index >= ring.list.length - 1} onClick={() => go(ring.list[ring.index + 1].id)} title="Next student (→)">Next →</button>
        </div>
      )}
      {list.length > 0 && (
        <div style={{ flexBasis: "100%", maxHeight: 280, overflowY: "auto", border: "1px solid var(--line, #eee)", borderRadius: 6 }}>
          {list.map((s) => <div key={s.id} onClick={() => go(s.id)} style={{ padding: "5px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--line, #f0f0f0)", background: s.id === current ? "rgba(21,101,192,.08)" : undefined }}>{row(s)}</div>)}
        </div>
      )}
    </div>
  );
}
