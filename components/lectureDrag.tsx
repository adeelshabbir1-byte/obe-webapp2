"use client";

import { useEffect, useRef, useState } from "react";

// Drag-to-reorder for the lecture plan grids, driven by pointer events (works with mouse and touch) from the grip,
// so the text inputs inside the row keep normal selection. With the grip focused, ↑ / ↓ move the lecture one slot (keyboard).

export function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true" fill="currentColor">
      <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
    </svg>
  );
}

export function useRowReorder(ids: string[], onMove: (fromId: string, toId: string) => void, disabled = false) {
  // Pointer-based (mouse, pen and touch): press the grip, drag over the rows, release on the target slot.
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const state = useRef<{ from: string; over: string | null; pointerId: number } | null>(null);
  const idx = (id: string) => ids.indexOf(id);

  const move = (from: string, to: string, refocus = false) => {
    if (disabled || from === to) return;
    onMove(from, to);
    if (refocus) requestAnimationFrame(() => (document.querySelector(`[data-grip-id="${to}"]`) as HTMLElement | null)?.focus());
  };
  const rowAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.closest("[data-row-id]") as HTMLElement | null)?.dataset.rowId || null;
  };
  const autoScroll = (y: number) => {
    const edge = 60;
    if (y < edge) window.scrollBy(0, -12);
    else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
  };

  const rowProps = (id: string) => ({
    "data-row-id": id,
    "data-dragging": drag === id ? "true" : undefined,
    "data-drop": drag && over === id && drag !== id ? (idx(drag) < idx(id) ? "after" : "before") : undefined,
  });

  const gripProps = (id: string, label: string) => ({
    type: "button" as const,
    className: "lp-grip",
    "data-grip-id": id,
    disabled,
    "aria-label": `Reorder ${label}. Drag, or use the up and down arrow keys.`,
    title: "Drag to move this lecture (or focus and press ↑ / ↓)",
    style: { touchAction: "none" as const },
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      state.current = { from: id, over: null, pointerId: e.pointerId };
      setDrag(id); setOver(null);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const st = state.current;
      if (!st || st.pointerId !== e.pointerId) return;
      autoScroll(e.clientY);
      const target = rowAt(e.clientX, e.clientY);
      if (target && target !== st.over) { st.over = target; setOver(target); }
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      const st = state.current;
      state.current = null;
      setDrag(null); setOver(null);
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      if (!st || st.pointerId !== e.pointerId) return;
      const target = rowAt(e.clientX, e.clientY) || st.over;
      if (target && target !== st.from) move(st.from, target);
    },
    onPointerCancel: () => {
      state.current = null; setDrag(null); setOver(null);
      document.body.style.cursor = ""; document.body.style.userSelect = "";
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      const i = idx(id);
      if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); move(id, ids[i - 1], true); }
      if (e.key === "ArrowDown" && i < ids.length - 1) { e.preventDefault(); move(id, ids[i + 1], true); }
    },
  });

  return { rowProps, gripProps, dragging: !!drag };
}

/** Moves the content of one slot to another and shifts the ones in between, the same way the server does. */
export function shiftContent<T extends { id: string }>(rows: T[], fromId: string, toId: string, content: (r: T) => Partial<T>): T[] {
  const i = rows.findIndex((r) => r.id === fromId), j = rows.findIndex((r) => r.id === toId);
  if (i < 0 || j < 0 || i === j) return rows;
  const c = rows.map(content);
  const [m] = c.splice(i, 1);
  c.splice(j, 0, m);
  return rows.map((r, k) => ({ ...r, ...c[k] }));
}

/** Topic accent: a quiet tone per topic, so lectures that continue a topic read as one group. */
const TONES = ["#8C6A5D", "#6F7F6A", "#5F7488", "#8A7A55", "#7A6283", "#5E7F7A", "#8B5E6B", "#6B6F78"];
export function topicTone(topic: string) {
  if (!topic || !topic.trim()) return "transparent";
  let h = 0;
  for (let i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
export const isExamRow = (topic: string) => /\b(mid[- ]?term|final)\b.*\b(exam|examination|review)\b|\bexam(ination)?\b/i.test(topic || "");

/**
 * Keeps lecture moves as a draft on the page: every drag only changes what you see, and nothing reaches the server
 * until save() — which sends the whole new order in one request. discard() puts everything back.
 */
export function useDraftOrder<T extends { id: string }>(opts: {
  rows: T[]; setRows: React.Dispatch<React.SetStateAction<T[]>>; content: (r: T) => Partial<T>;
  url: string; merge: (prev: T, raw: any) => T;
}) {
  const { rows, setRows, content, url, merge } = opts;
  // src[k] = the row whose saved content now sits in slot k; null = nothing moved (the saved order).
  const [srcState, setSrc] = useState<string[] | null>(null);
  const src = srcState && srcState.length === rows.length ? srcState : rows.map((r) => r.id);
  const [snapshot, setSnapshot] = useState<T[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const moved = src.filter((s, k) => s !== rows[k]?.id).length;
  const dirty = moved > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function move(fromId: string, toId: string) {
    const i = rows.findIndex((r) => r.id === fromId), j = rows.findIndex((r) => r.id === toId);
    if (i < 0 || j < 0 || i === j) return;
    if (!snapshot) setSnapshot(rows);
    setError("");
    setRows((prev) => shiftContent(prev, fromId, toId, content));
    const a = [...src]; const [m] = a.splice(i, 1); a.splice(j, 0, m);
    setSrc(a);
  }
  function discard() {
    if (snapshot) setRows(snapshot);
    setSrc(null); setSnapshot(null); setError("");
  }
  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: src }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not save the new order."); return; }
      const byId = new Map<string, any>((data.rows || []).map((r: any) => [r.id, r]));
      setRows((prev) => prev.map((r) => (byId.has(r.id) ? merge(r, byId.get(r.id)) : r)));
      setSrc(null); setSnapshot(null);
    } catch (e: any) { setError("Could not save the new order: " + (e?.message || e)); }
    finally { setSaving(false); }
  }
  const isMoved = (id: string) => { const k = rows.findIndex((r) => r.id === id); return k >= 0 && src[k] !== id; };
  return { move, save, discard, dirty, moved, saving, error, isMoved };
}

/** The bar that appears while there are unsaved moves. */
export function DraftOrderBar({ moved, saving, error, onSave, onDiscard }: { moved: number; saving: boolean; error: string; onSave: () => void; onDiscard: () => void }) {
  return (
    <div className="lp-draftbar" role="status">
      <span><b>New order not saved yet</b> · {moved} lecture slot{moved === 1 ? "" : "s"} changed. Keep moving lectures, then save once.{error && <span className="lp-draftbar-err"> {error}</span>}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onDiscard} disabled={saving}>Discard</button>
        <button type="button" className="btn btn-brass" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save order"}</button>
      </span>
    </div>
  );
}
