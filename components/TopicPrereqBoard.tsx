"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string };
type Topic = { key: string; topic: string; subtopic: string | null; lecture: number; week: number };
type Link = { id: string; prereqTopic: string; dependentTopic: string; note: string | null; strength: string; orphaned?: boolean };

// Strong links block registration until the topic is attained; Mild / Weak links ask the dependent course to review it.
const STRENGTH: Record<string, { label: string; color: string; dash?: string; width: number; hint: string }> = {
  STRONG: { label: "Strong", color: "var(--rust)", width: 3, hint: "must be attained before registering" },
  MILD: { label: "Mild", color: "var(--brass)", width: 2, hint: "reviewed in the dependent course" },
  WEAK: { label: "Weak", color: "var(--slate)", dash: "5 4", width: 1.6, hint: "short recap in the dependent course" },
};
const st = (s: string) => STRENGTH[s] || STRENGTH.MILD;

const norm = (t: string) => (t || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").trim();

/**
 * Two lecture plans side by side. Drag a topic of the prerequisite course (left) onto the topic of the other course
 * that needs it (right) — or click a left topic, then "Link here" on the right one. Lines show the links.
 */
export default function TopicPrereqBoard({ a, b, topicsA, topicsB, links, canEdit }: { a: Course; b: Course; topicsA: Topic[]; topicsB: Topic[]; links: Link[]; canEdit: boolean }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const leftRefs = useRef(new Map<string, HTMLDivElement>());
  const rightRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<{ id: string; d: string; strength: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [picked, setPicked] = useState<Topic | null>(null);
  const [dragging, setDragging] = useState<Topic | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [strength, setStrength] = useState("MILD");
  const [hover, setHover] = useState<string | null>(null);

  const leftOf = (t: string) => topicsA.find((x) => norm(x.topic) === norm(t));
  const rightOf = (t: string) => topicsB.find((x) => norm(x.topic) === norm(t));
  // A course with no lecture plan yet hasn't lost the topic; only a plan without it has.
  const orphan = links.filter((l) => (topicsA.length > 0 && !leftOf(l.prereqTopic)) || (topicsB.length > 0 && !rightOf(l.dependentTopic)));

  const draw = useCallback(() => {
    const root = box.current;
    if (!root) return;
    const r0 = root.getBoundingClientRect();
    setSize({ w: r0.width, h: r0.height });
    const out: { id: string; d: string; strength: string }[] = [];
    for (const l of links) {
      const la = leftOf(l.prereqTopic), rb = rightOf(l.dependentTopic);
      const ea = la && leftRefs.current.get(la.key), eb = rb && rightRefs.current.get(rb.key);
      if (!ea || !eb) continue;
      const pa = ea.getBoundingClientRect(), pb = eb.getBoundingClientRect();
      const x1 = pa.right - r0.left, y1 = pa.top + pa.height / 2 - r0.top;
      const x2 = pb.left - r0.left, y2 = pb.top + pb.height / 2 - r0.top;
      const mx = (x1 + x2) / 2;
      out.push({ id: l.id, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, strength: l.strength });
    }
    setPaths(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, topicsA, topicsB]);

  useLayoutEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const on = () => draw();
    window.addEventListener("resize", on);
    const t = setTimeout(draw, 300);
    return () => { window.removeEventListener("resize", on); clearTimeout(t); };
  }, [draw]);

  async function link(from: Topic, to: Topic) {
    if (!canEdit) return;
    if (links.some((l) => norm(l.prereqTopic) === norm(from.topic) && norm(l.dependentTopic) === norm(to.topic))) { setError("Those two topics are already linked."); return; }
    setBusy(true); setError("");
    const res = await fetch("/api/topic-prerequisites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prereqCourseId: a.id, prereqTopic: from.topic, dependentCourseId: b.id, dependentTopic: to.topic, note, strength }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false); setPicked(null); setNote("");
    if (!res.ok) { setError(data.error || "Could not link the topics."); return; }
    router.refresh();
  }
  async function unlink(id: string) {
    if (!canEdit || !confirm("Remove this prerequisite link?")) return;
    setBusy(true); setError("");
    const res = await fetch(`/api/topic-prerequisites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Could not remove the link."); return; }
    router.refresh();
  }

  async function regrade(id: string, next: string) {
    if (!canEdit) return;
    setBusy(true); setError("");
    const res = await fetch("/api/topic-prerequisites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, strength: next }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Could not change the link."); return; }
    router.refresh();
  }

  const linkedFrom = (t: Topic) => links.filter((l) => norm(l.dependentTopic) === norm(t.topic));
  const linkedTo = (t: Topic) => links.filter((l) => norm(l.prereqTopic) === norm(t.topic));
  const item = (t: Topic, side: "L" | "R") => {
    const isPicked = side === "L" && picked?.key === t.key;
    const isOver = side === "R" && overKey === t.key;
    const count = side === "L" ? linkedTo(t).length : linkedFrom(t).length;
    const active = hover && links.some((l) => l.id === hover && (side === "L" ? norm(l.prereqTopic) === norm(t.topic) : norm(l.dependentTopic) === norm(t.topic)));
    return (
      <div
        key={t.key}
        ref={(el) => { const m = side === "L" ? leftRefs.current : rightRefs.current; if (el) m.set(t.key, el); else m.delete(t.key); }}
        draggable={canEdit && side === "L"}
        onDragStart={(e) => { if (side === "L") { setDragging(t); e.dataTransfer.effectAllowed = "link"; e.dataTransfer.setData("text/plain", t.topic); } }}
        onDragEnd={() => { setDragging(null); setOverKey(null); }}
        onDragOver={(e) => { if (side === "R" && dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "link"; setOverKey(t.key); } }}
        onDragLeave={() => { if (side === "R") setOverKey((k) => (k === t.key ? null : k)); }}
        onDrop={(e) => { if (side === "R" && dragging) { e.preventDefault(); setOverKey(null); link(dragging, t); setDragging(null); } }}
        onClick={() => { if (side === "L" && canEdit) setPicked(isPicked ? null : t); }}
        style={{
          background: isOver ? "var(--royal-50)" : isPicked ? "#FBEED2" : active ? "#F5EBEA" : "#fff",
          border: `1px solid ${isOver || isPicked ? "var(--brass)" : "var(--line)"}`, borderRadius: 8, padding: "7px 10px", marginBottom: 6,
          cursor: canEdit && side === "L" ? "grab" : "default", fontSize: 12.5, position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span><b style={{ color: "var(--slate)", fontWeight: 600 }}>L{t.lecture}</b> · {t.topic}{t.subtopic ? <span className="small-note"> — {t.subtopic}</span> : null}</span>
          <span className="small-note" style={{ whiteSpace: "nowrap" }}>wk {t.week}{count ? ` · ${count} link${count > 1 ? "s" : ""}` : ""}</span>
        </div>
        {side === "R" && linkedFrom(t).length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {linkedFrom(t).map((l) => (
              <span key={l.id} className="badge badge-neutral" onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)} title={`${st(l.strength).label}: ${st(l.strength).hint}${l.note ? ` — ${l.note}` : ""}`} style={{ borderLeft: `3px solid ${st(l.strength).color}` }}>
                needs {a.code}: {l.prereqTopic}
                {canEdit ? (
                  <select value={l.strength} disabled={busy} onClick={(e) => e.stopPropagation()} onChange={(e) => regrade(l.id, e.target.value)} aria-label="Link strength" style={{ marginLeft: 6, fontSize: 11, padding: "0 2px", height: 20 }}>
                    {Object.entries(STRENGTH).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                ) : <b style={{ marginLeft: 6, color: st(l.strength).color }}>{st(l.strength).label}</b>}
                {canEdit && <button type="button" onClick={(e) => { e.stopPropagation(); unlink(l.id); }} aria-label="Remove link" style={{ marginLeft: 4, border: 0, background: "none", cursor: "pointer", color: "var(--rust)" }}>✕</button>}
              </span>
            ))}
          </div>
        )}
        {side === "R" && picked && canEdit && (
          <button type="button" className="btn btn-brass btn-xs" style={{ marginTop: 6 }} disabled={busy} onClick={(e) => { e.stopPropagation(); link(picked, t); }}>Link here</button>
        )}
      </div>
    );
  };

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {canEdit ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <p className="small-note" style={{ margin: 0 }}>
            Drag a topic from <b>{a.code}</b> onto the topic of <b>{b.code}</b> that needs it — or click it, then press &quot;Link here&quot;.
          </p>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>Next link is
            <select value={strength} onChange={(e) => setStrength(e.target.value)} aria-label="Strength of the next link">
              {Object.entries(STRENGTH).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.hint}</option>)}
            </select>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the next link (why it is needed)" style={{ flex: "1 1 260px", maxWidth: 420 }} maxLength={500} />
          {picked && <span className="badge badge-warn">Picked: {picked.topic} <button type="button" onClick={() => setPicked(null)} style={{ border: 0, background: "none", cursor: "pointer" }}>✕</button></span>}
        </div>
      ) : <p className="small-note">Only the Subject Expert of one of these courses, the Program Lead or the OMC can change the links.</p>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }} aria-label="Link strengths">
        {Object.entries(STRENGTH).map(([k, v]) => (
          <span key={k} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke={v.color} strokeWidth={v.width} strokeDasharray={v.dash} /></svg>
            <b style={{ color: v.color }}>{v.label}</b> {v.hint}
          </span>
        ))}
      </div>
      <div ref={box} style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px minmax(0,1fr)", gap: 0 }}>
        <div>
          <div style={{ background: "var(--navy-900)", color: "#fff", padding: "8px 10px", borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 13 }}>{a.code} — {a.title} <span style={{ fontWeight: 400, opacity: 0.8 }}>(prerequisite)</span></div>
          <div style={{ border: "1px solid var(--line)", borderTop: 0, padding: 8, borderRadius: "0 0 8px 8px", minHeight: 120 }}>
            {topicsA.length ? topicsA.map((t) => item(t, "L")) : <p className="small-note">No lecture plan yet.</p>}
          </div>
        </div>
        <div />
        <div>
          <div style={{ background: "var(--brass)", color: "#fff", padding: "8px 10px", borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 13 }}>{b.code} — {b.title} <span style={{ fontWeight: 400, opacity: 0.85 }}>(needs it)</span></div>
          <div style={{ border: "1px solid var(--line)", borderTop: 0, padding: 8, borderRadius: "0 0 8px 8px", minHeight: 120 }}>
            {topicsB.length ? topicsB.map((t) => item(t, "R")) : <p className="small-note">No lecture plan yet.</p>}
          </div>
        </div>
        <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }} aria-hidden="true">
          {paths.map((p) => (
            <path key={p.id} d={p.d} fill="none" stroke={st(p.strength).color} strokeDasharray={st(p.strength).dash} strokeWidth={hover === p.id ? st(p.strength).width + 1.5 : st(p.strength).width} strokeOpacity={hover && hover !== p.id ? 0.35 : 0.85} />
          ))}
        </svg>
      </div>
      {orphan.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Links to topics no longer in these plans</h4>
          <p className="small-note">The topic was renamed or removed from the lecture plan. Remove the link, or link the new topic.</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {orphan.map((l) => <li key={l.id}>{a.code}: {l.prereqTopic} → {b.code}: {l.dependentTopic} {canEdit && <button type="button" className="act act-danger" onClick={() => unlink(l.id)}>Remove</button>}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
