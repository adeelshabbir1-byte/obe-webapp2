"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assignCodes, duplicateCodes, LEVEL_LABEL, type Level } from "../lib/courseHomeCore";

// Drag-and-drop course homes. Phase 1 (Dean): columns University common (GE) + one per department. Phase 2 (Institute
// Head / HOD): Department common + one per program, tracks under each. The Program Lead adjusts tracks and chains in his
// programs. Each card shows its code live, its programs and warnings; every move can be undone; the result is saved as a
// draft that only the BOS approves.

type Row = {
  key: string; title: string; isLab: boolean; programs: string[]; semesters: number[]; category: string; currentCodes: string[]; level: Level; departmentId: string | null; program: string | null;
  track: string | null; chain: number | null; code: string | null; approvedCode: string | null; aliases: string[]; flags: string[]; approved: boolean; home: { level: Level; departmentId: string | null; program: string | null } | null;
};
type Dept = { id: string; name: string; prefix: string | null };
type Prog = { name: string; departmentId: string | null; prefix: string | null };
type Change = { level?: Level; departmentId?: string | null; program?: string | null; track?: string | null; chain?: number | null; renumber?: boolean };

export default function CourseHomeBoard({ rows, depts, programs, chains, tracks, phase, deptId, myPrograms, draftId }: {
  rows: Row[]; depts: Dept[]; programs: Prog[]; chains: Record<string, { chain: number; name: string }[]>; tracks: Record<string, string[]>;
  phase: "DEAN" | "DEPT" | "PL"; deptId: string | null; myPrograms: string[]; draftId: string | null;
}) {
  const router = useRouter();
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [history, setHistory] = useState<Record<string, Change>[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const placed = useMemo(() => rows.map((r) => ({ ...r, ...changes[r.key], level: changes[r.key]?.level ?? r.level, departmentId: changes[r.key]?.departmentId !== undefined ? changes[r.key]!.departmentId! : r.departmentId, program: changes[r.key]?.program !== undefined ? changes[r.key]!.program! : r.program })), [rows, changes]);
  // Codes recomputed live from the placements (approved codes kept unless the home changes).
  const coded = useMemo(() => {
    const prefix = (r: (typeof placed)[number]) => r.level === "GE" ? "GE" : r.level === "PROGRAM" ? programs.find((p) => p.name === r.program)?.prefix || depts.find((d) => d.id === r.departmentId)?.prefix || null : depts.find((d) => d.id === r.departmentId)?.prefix || null;
    const out = assignCodes(placed.map((r) => ({ key: r.key, title: r.title, isLab: r.isLab, prefix: prefix(r), semester: r.semesters[0] ?? null, chain: r.chain, approvedCode: r.approvedCode && r.home && r.home.level === r.level && r.home.departmentId === r.departmentId && r.home.program === r.program && !r.renumber ? r.approvedCode : null, renumber: r.renumber })));
    const dup = new Set(duplicateCodes(out).flatMap((d) => d.keys));
    return new Map(out.map((c) => [c.key, { ...c, dup: dup.has(c.key) }]));
  }, [placed, depts, programs]);

  const columns: { id: string; label: string; match: (r: (typeof placed)[number]) => boolean; drop: Change | null }[] = phase === "DEAN"
    ? [{ id: "GE", label: "University common (GE)", match: (r) => r.level === "GE", drop: { level: "GE", departmentId: null, program: null } },
      ...depts.map((d) => ({ id: d.id, label: `${d.name}${d.prefix ? ` (${d.prefix})` : ""}`, match: (r: (typeof placed)[number]) => r.level !== "GE" && r.departmentId === d.id, drop: null as Change | null }))]
    : [{ id: "COMMON", label: `${depts.find((d) => d.id === deptId)?.name || "Department"} common`, match: (r) => r.departmentId === deptId && r.level !== "PROGRAM", drop: phase === "PL" ? null : { level: "DEPARTMENT", departmentId: deptId, program: null } },
      ...programs.filter((p) => p.departmentId === deptId && (phase !== "PL" || myPrograms.includes(p.name))).map((p) => ({ id: `P:${p.name}`, label: `${p.name}${p.prefix ? ` (${p.prefix})` : ""}`, match: (r: (typeof placed)[number]) => r.level === "PROGRAM" && r.program === p.name, drop: phase === "PL" ? null : { level: "PROGRAM" as Level, departmentId: deptId, program: p.name } }))];

  function change(key: string, c: Change) { setHistory((h) => [...h, changes]); setChanges((x) => ({ ...x, [key]: { ...x[key], ...c } })); setMsg(null); }
  function dropOn(colId: string, key: string) {
    const col = columns.find((c) => c.id === colId); const r = placed.find((x) => x.key === key);
    if (!col || !r) return;
    if (col.drop) return change(key, col.drop);
    if (phase === "DEAN") {
      // Into a department: shared there by 2+ programs → department common; one of its programs → that program; else a service subject.
      const own = r.programs.filter((p) => programs.find((x) => x.name === p)?.departmentId === colId);
      change(key, own.length >= 2 ? { level: "DEPARTMENT", departmentId: colId, program: null } : own.length === 1 && r.programs.length === 1 ? { level: "PROGRAM", departmentId: colId, program: own[0] } : { level: "SERVICE", departmentId: colId, program: null });
    }
  }
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/course-homes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", draftId, changes }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setMsg({ ok: true, text: "Draft saved. Send it to the BOS when ready — nothing changes until the BOS approves." });
      setChanges({}); setHistory([]);
      router.push(`/course-homes?draft=${j.draftId}`); router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  const ql = q.trim().toLowerCase();
  const hit = (r: (typeof placed)[number]) => !ql ? null : (coded.get(r.key)?.code || "").toLowerCase().includes(ql) || r.aliases.some((a) => a.toLowerCase().includes(ql)) ? "code" : r.title.toLowerCase().includes(ql) ? "title" : r.programs.some((p) => p.toLowerCase().includes(ql)) ? "program" : null;
  const HL: Record<string, string> = { code: "#FFE08A", title: "#BFE3C9", program: "#C9DCF5" };
  const editable = (r: (typeof placed)[number]) => phase !== "PL" || r.programs.some((p) => myPrograms.includes(p));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
        <input placeholder="Search code, old code, title or program" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 240px" }} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={!history.length} onClick={() => { setChanges(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); }}>↶ Undo</button>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy || !Object.keys(changes).length} onClick={save}>{busy ? "Saving…" : `Save as draft (${Object.keys(changes).length} change${Object.keys(changes).length === 1 ? "" : "s"})`}</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 230px), 1fr))`, gap: 8 }}>
        {columns.map((col) => {
          const cards = placed.filter(col.match);
          return (
            <div key={col.id} className="card" style={{ margin: 0, padding: 8, minHeight: 120, background: drag ? "#FBF8F2" : undefined }} data-column={col.label} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); if (k) dropOn(col.id, k); setDrag(null); }}>
              <b style={{ fontSize: 13 }}>{col.label}</b> <span className="small-note">({cards.length})</span>
              {cards.map((r) => {
                const c = coded.get(r.key)!;
                const h = hit(r);
                const flags = [...r.flags.filter((f) => !/^Duplicate code/.test(f) && !/full/.test(f) && !/No prefix/.test(f)), ...c.flags, ...(c.dup ? [`Duplicate code ${c.code}`] : [])];
                const deptChains = (r.level === "GE" ? chains.GE : chains[r.departmentId || ""]) || chains.GE || [];
                return (
                  <div key={r.key} draggable={editable(r) && phase !== "PL"} onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.key); setDrag(r.key); }} onDragEnd={() => setDrag(null)}
                    data-card={r.title} style={{ border: `1px solid ${flags.length ? "#E0B54A" : "var(--line)"}`, borderRadius: 6, padding: 6, margin: "6px 0", background: h ? HL[h] : "var(--card, #fff)", cursor: phase !== "PL" && editable(r) ? "grab" : "default", fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}><b data-code>{c.code || "—"}</b>{changes[r.key] && <span className="small-note">moved</span>}</div>
                    <div>{r.title}</div>
                    <div className="small-note">{r.programs.join(", ") || "—"} · S{r.semesters.join("/") || "?"} · {r.category}{r.track ? ` · track ${r.track}` : ""}</div>
                    {r.approvedCode && c.code !== r.approvedCode && <div className="small-note">was {r.approvedCode} (kept as an alias)</div>}
                    {r.aliases.length > 0 && <div className="small-note">old: {r.aliases.join(", ")}</div>}
                    {flags.map((f) => <div key={f} style={{ color: "#8A5A00" }}>⚠ {f}</div>)}
                    {editable(r) && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                        {phase !== "PL" && <select aria-label="Move to" value="" onChange={(e) => { if (e.target.value) dropOn(e.target.value, r.key); }} style={{ fontSize: 11 }}><option value="">Move to…</option>{columns.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>}
                        <select aria-label="Chain" value={String(changes[r.key]?.chain ?? r.chain ?? 0)} onChange={(e) => change(r.key, { chain: Number(e.target.value) })} style={{ fontSize: 11 }}>{deptChains.map((ch) => <option key={ch.chain} value={ch.chain}>C{ch.chain} {ch.name}</option>)}</select>
                        {phase !== "DEAN" && r.level === "PROGRAM" && (tracks[r.program || ""] || []).length > 0 && <select aria-label="Track" value={changes[r.key]?.track ?? r.track ?? ""} onChange={(e) => change(r.key, { track: e.target.value || null })} style={{ fontSize: 11 }}><option value="">No track</option>{(tracks[r.program || ""] || []).map((t) => <option key={t}>{t}</option>)}</select>}
                        {r.approved && phase !== "PL" && <label style={{ fontSize: 11 }}><input type="checkbox" checked={!!changes[r.key]?.renumber} onChange={(e) => change(r.key, { renumber: e.target.checked })} /> renumber (BOS)</label>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="small-note">{LEVEL_LABEL.GE} → GE (or the teaching department&apos;s prefix) · {LEVEL_LABEL.SERVICE} → its prefix · {LEVEL_LABEL.DEPARTMENT} → the department prefix · {LEVEL_LABEL.PROGRAM} → the program prefix. Codes are PREFIX-YCN: year from the planned semester, the department&apos;s chain, the next free number. A lab is the same code + L.</p>
    </div>
  );
}
