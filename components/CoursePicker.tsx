"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Batch → semester → course, with a search that short-lists the best matches: code or title, any word order,
// initials ("QR" → Quantitative Reasoning, "pf" → Programming Fundamentals) and small typos.
export type PickCourse = { id: string; code: string; title: string; batchId: string | null; semester: number | null };
export type PickBatch = { id: string; label: string; current: number | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const initials = (t: string) => norm(t).split(" ").filter((w) => w.length > 2 || /\d|^i+$/.test(w)).map((w) => (/^\d+$|^i+$/.test(w) ? w : w[0])).join("");
function near(a: string, b: string) { // a within one edit of b's prefix
  if (Math.abs(a.length - b.length) > 1 && b.length > a.length + 1) b = b.slice(0, a.length + 1);
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; } else { if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } }
  return e + (a.length - i) <= 1;
}
export function score(q: string, c: { code: string; title: string }) {
  const qn = norm(q); if (!qn) return 1;
  const code = norm(c.code), title = norm(c.title), ini = initials(c.title);
  if (code === qn || code.replace(/ /g, "") === qn.replace(/ /g, "")) return 100;
  if (ini === qn.replace(/ /g, "")) return 90;
  if (title.startsWith(qn)) return 80;
  if (code.includes(qn)) return 70;
  if (ini.startsWith(qn.replace(/ /g, "")) && qn.length >= 2) return 60;
  const words = qn.split(" "), tw = title.split(" ");
  const hits = words.filter((w) => tw.some((t) => t.startsWith(w) || (w.length >= 4 && near(w, t))));
  if (hits.length === words.length) return 50 + hits.length;
  return hits.length ? 10 * hits.length : 0;
}

export default function CoursePicker({ basePath, batches, courses, batchId, semester, courseId, extra = {} }: { basePath: string; batches: PickBatch[]; courses: PickCourse[]; batchId: string; semester: number | null; courseId: string; extra?: Record<string, string> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const b = batches.find((x) => x.id === batchId) || null;
  const sems = Array.from(new Set(courses.filter((c) => !b || c.batchId === b.id).map((c) => c.semester).filter((s): s is number => !!s))).sort((x, y) => x - y);
  const go = (p: Record<string, string>) => router.push(`${basePath}?${new URLSearchParams({ ...extra, ...p }).toString()}`);
  const list = useMemo(() => {
    const pool = courses.filter((c) => (!b || c.batchId === b.id) && (q || !semester || c.semester === semester));
    return pool.map((c) => ({ c, s: score(q, c) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || (x.c.semester ?? 99) - (y.c.semester ?? 99) || x.c.code.localeCompare(y.c.code)).slice(0, q ? 12 : 60);
  }, [courses, b, q, semester]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12.5 }}>Batch</label>
        <select value={batchId} onChange={(e) => { const nb = batches.find((x) => x.id === e.target.value); go({ batchId: e.target.value, ...(nb?.current ? { semester: String(nb.current) } : {}) }); }} style={{ minWidth: 240 }}>
          <option value="">Any batch</option>{batches.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {sems.length > 0 && <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="Semester">
          {sems.map((s) => <button key={s} type="button" onClick={() => go({ batchId, semester: String(s) })} className={semester === s ? "btn btn-sm" : "btn btn-secondary btn-sm"} title={b?.current === s ? "Current semester" : undefined} style={b?.current === s ? { boxShadow: "0 0 0 2px #E0A030" } : undefined}>S{s}{b?.current === s ? " ●" : ""}</button>)}
          <button type="button" onClick={() => go({ batchId })} className={!semester ? "btn btn-sm" : "btn btn-secondary btn-sm"}>All</button>
        </span>}
      </div>
      <input placeholder="Find a course — code, title, or initials (e.g. QR, pf)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a course" style={{ maxWidth: 420 }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {list.map(({ c }) => <button key={c.id} type="button" onClick={() => go({ batchId: c.batchId || batchId, ...(c.semester ? { semester: String(c.semester) } : {}), courseId: c.id })} className={c.id === courseId ? "btn btn-sm" : "btn btn-secondary btn-sm"} style={{ textAlign: "left" }}>
          <b>{c.code}</b> {c.title}{!b && <span style={{ opacity: 0.7 }}> · {batches.find((x) => x.id === c.batchId)?.label || ""}</span>}{c.semester ? <span style={{ opacity: 0.7 }}> · S{c.semester}</span> : null}
        </button>)}
        {!list.length && <span className="small-note" style={{ margin: 0 }}>No course matches.</span>}
      </div>
    </div>
  );
}
