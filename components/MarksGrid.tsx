"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isPaperType, withCodes } from "../lib/assessmentCodes";

type Item = { id: string; type: string; label: string; maxScore: number };
type Row = { id: string; name: string; rollNumber: string; isRepeat?: boolean; marks: Record<string, number> };
type Move = "auto" | "down" | "across";

const TYPE_COLOR: Record<string, string> = { Assignment: "#2563EB", Quiz: "#1D8A4E", Project: "#7C3AED", Lab: "#EA580C", Midterm: "#DB2777", Final: "#CA8A04" };
const MOVE_KEY = "obe:marks-move";
const MOVES: { key: Move; label: string; hint: string }[] = [
  { key: "auto", label: "Auto", hint: "Assignments, quizzes, projects and labs go down the class; midterm and final questions go across one student's paper, then to the next student." },
  { key: "down", label: "Next student", hint: "Always move down to the next student in the same column." },
  { key: "across", label: "Next item", hint: "Always move across to the student's next item, then to the next student." },
];

/**
 * The marks grid used on Marks Entry and in Result Mate. Columns are headed A1, A2, Q1 ... MQ1 (midterm question 1),
 * FQ1 (final question 1). Enter or Tab saves the box and moves on: by default down the class for assignments and
 * quizzes, and across a student's exam questions for midterm / final papers (both can be changed). Shift goes back,
 * the arrow keys move up and down, Esc undoes the box.
 */
export default function MarksGrid({ courseId, items, students, editable = true, onSaved, rowAction, footer }: {
  courseId: string;
  items: Item[];
  students: Row[];
  editable?: boolean;
  onSaved?: () => void;
  rowAction?: (s: Row) => React.ReactNode;
  footer?: { label: string; values: Record<string, string | number | null | undefined> }[];
}) {
  const cols = useMemo(() => withCodes(items), [items]);
  const groups = useMemo(() => {
    const g: { type: string; span: number }[] = [];
    for (const c of cols) { const last = g[g.length - 1]; if (last && last.type === c.type) last.span++; else g.push({ type: c.type, span: 1 }); }
    return g;
  }, [cols]);
  const saved = useRef<Record<string, Record<string, number>>>({});
  useEffect(() => { saved.current = Object.fromEntries(students.map((s) => [s.id, { ...s.marks }])); }, [students]);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [mode, setMode] = useState<Move>("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => { try { const m = localStorage.getItem(MOVE_KEY) as Move | null; if (m && MOVES.some((x) => x.key === m)) setMode(m); } catch { /* no storage */ } }, []);
  function chooseMode(m: Move) { setMode(m); try { localStorage.setItem(MOVE_KEY, m); } catch { /* no storage */ } }

  const needle = filter.trim().toLowerCase();
  const shown = (s: Row) => !needle || s.name.toLowerCase().includes(needle) || s.rollNumber.toLowerCase().includes(needle);

  async function save(el: HTMLInputElement, studentId: string, item: Item) {
    const before = saved.current[studentId]?.[item.id];
    const raw = el.value.trim();
    if (raw === "") { el.value = before !== undefined ? String(before) : ""; return; } // a blank box never deletes a saved mark
    const value = Number(raw);
    if (before !== undefined && value === before) return;
    if (!Number.isFinite(value) || value < 0 || value > item.maxScore) {
      setError(`${item.label}: marks must be between 0 and ${item.maxScore}.`);
      el.value = before !== undefined ? String(before) : "";
      flash(el, "var(--rust)");
      return;
    }
    const key = studentId + item.id;
    setBusy(key); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/marks`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, instrumentId: item.id, score: raw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save that mark.");
        el.value = before !== undefined ? String(before) : "";
        flash(el, "var(--rust)");
      } else {
        saved.current[studentId] = { ...(saved.current[studentId] || {}), [item.id]: data.mark?.score ?? value };
        flash(el, "var(--sage)");
        onSaved?.();
      }
    } catch (e) {
      setError("Could not reach the server: " + (e as Error).message);
      el.value = before !== undefined ? String(before) : "";
    }
    setBusy(null);
  }

  function flash(el: HTMLInputElement, color: string) {
    el.style.borderColor = color;
    setTimeout(() => { el.style.borderColor = ""; }, 1200);
  }

  function rows() {
    return Array.from(tbodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-sid]") || []).filter((r) => !r.hidden);
  }
  const cell = (row: HTMLTableRowElement | undefined, col: number) => row?.querySelector<HTMLInputElement>(`input[data-col="${col}"]`) || null;

  function go(el: HTMLInputElement, dir: "next" | "prev" | "down" | "up") {
    const list = rows();
    const tr = el.closest("tr") as HTMLTableRowElement;
    const r = list.indexOf(tr);
    const c = Number(el.dataset.col);
    let target: HTMLInputElement | null = null;
    if (dir === "down" || dir === "up") {
      target = cell(list[r + (dir === "down" ? 1 : -1)], c);
    } else {
      const fwd = dir === "next";
      const how = mode === "auto" ? (isPaperType(cols[c].type) ? "across" : "down") : mode;
      if (how === "down") {
        const nr = r + (fwd ? 1 : -1);
        if (nr >= 0 && nr < list.length) target = cell(list[nr], c);
        else {
          const nc = c + (fwd ? 1 : -1);
          if (nc >= 0 && nc < cols.length) target = cell(list[fwd ? 0 : list.length - 1], nc);
        }
      } else {
        // Auto: stay within the same paper (all midterm questions, then the next student's). "Next item": every column.
        const range = cols.map((_, i) => i).filter((i) => mode === "across" || cols[i].type === cols[c].type);
        const p = range.indexOf(c) + (fwd ? 1 : -1);
        if (p >= 0 && p < range.length) target = cell(tr, range[p]);
        else {
          const nr = r + (fwd ? 1 : -1);
          if (nr >= 0 && nr < list.length) target = cell(list[nr], range[fwd ? 0 : range.length - 1]);
        }
      }
    }
    if (target) target.focus();
    else el.blur();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>, studentId: string, item: Item) {
    const el = e.currentTarget;
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); go(el, e.shiftKey ? "prev" : "next"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); go(el, "down"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(el, "up"); }
    else if (e.key === "Escape") { const b = saved.current[studentId]?.[item.id]; el.value = b !== undefined ? String(b) : ""; el.blur(); }
  }

  const current = MOVES.find((m) => m.key === mode)!;

  return (
    <div>
      {editable && (
        <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Enter / Tab moves to:</span>
          <div className="tabs" role="radiogroup" aria-label="Where Enter and Tab move" style={{ marginBottom: 0 }}>
            {MOVES.map((m) => (
              <button key={m.key} type="button" role="radio" className="tab" aria-checked={mode === m.key} aria-selected={mode === m.key} onClick={() => chooseMode(m.key)} title={m.hint}>{m.label}</button>
            ))}
          </div>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a student…" aria-label="Find a student" style={{ maxWidth: 220 }} />
        </div>
      )}
      {editable && <p className="small-note no-print" style={{ marginTop: 0 }}>{current.hint} Shift + Enter goes back, ↑ ↓ move up and down, Esc undoes the box. Each mark is saved as you leave its box.</p>}
      {error && <div className="err">{error}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 260 + cols.length * 62 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ minWidth: 150 }}>Name</th>
              <th rowSpan={2} style={{ minWidth: 100 }}>Roll #</th>
              {groups.map((g, i) => (
                <th key={`${g.type}-${i}`} colSpan={g.span} style={{ textAlign: "center", background: TYPE_COLOR[g.type] || "#94A3B8", color: "#fff" }}>
                  {isPaperType(g.type) ? `${g.type} paper` : g.span > 1 ? `${g.type}s` : g.type}
                </th>
              ))}
              {rowAction && <th rowSpan={2} style={{ width: 70 }}></th>}
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.id} title={c.name} style={{ textAlign: "center", minWidth: 58 }}>
                  {c.code}<br /><span style={{ fontWeight: 400, color: "var(--slate)" }}>/{c.maxScore}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {students.map((s) => (
              <tr key={s.id} data-sid={s.id} hidden={!shown(s)}>
                <td>{s.name}{s.isRepeat && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Repeat</span>}</td>
                <td>{s.rollNumber}</td>
                {cols.map((c, ci) => (
                  <td key={c.id} style={{ textAlign: "center", padding: "4px 6px" }}>
                    {editable ? (
                      <input
                        type="number" inputMode="decimal" min={0} max={c.maxScore} step="any"
                        defaultValue={s.marks[c.id] ?? ""} disabled={busy === s.id + c.id}
                        data-col={ci} aria-label={`${c.name} for ${s.name}`}
                        onFocus={(e) => e.currentTarget.select()}
                        onWheel={(e) => e.currentTarget.blur()}
                        onKeyDown={(e) => onKey(e, s.id, c)}
                        onBlur={(e) => save(e.currentTarget, s.id, c)}
                        style={{ width: 54, padding: "4px 5px", textAlign: "center", fontSize: 12 }}
                      />
                    ) : (s.marks[c.id] ?? "—")}
                  </td>
                ))}
                {rowAction && <td>{rowAction(s)}</td>}
              </tr>
            ))}
            {footer?.map((f) => (
              <tr key={f.label} style={{ fontWeight: 700 }}>
                <td colSpan={2}>{f.label}</td>
                {cols.map((c) => <td key={c.id} style={{ textAlign: "center" }}>{f.values[c.id] ?? "—"}</td>)}
                {rowAction && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
