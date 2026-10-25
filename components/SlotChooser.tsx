"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SlotGroup } from "../lib/slotChoice";

// "Choose from the list": tick up to the number of slots (e.g. 4 IDS courses); each ticked option fills one slot.
export default function SlotChooser({ batchId, groups, choices }: { batchId: string; groups: SlotGroup[]; choices: { courseId: string; byName: string; at: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<SlotGroup | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!groups.length) return null;
  const start = (g: SlotGroup) => { setOpen(g); setSel(new Set(g.slots.map((s) => s.chosen).filter((x): x is string => !!x))); setQ(""); setMsg(null); };
  async function save() {
    if (!open) return;
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/coordinator/batches/${batchId}/choose-slots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flavour: open.flavour, masterCourseIds: Array.from(sel) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Could not save." }); return; }
    setMsg({ ok: true, text: d.message }); setOpen(null); router.refresh();
  }
  const name = (fl: string) => (fl === "IDS" ? "IDS" : "Elective");
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Elective / IDS slots — choose from the list</h3>
      {msg && !open && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {groups.map((g) => { const chosen = g.slots.filter((s) => s.chosen); return (
          <div key={g.flavour} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <b>{name(g.flavour)}</b>
              <span style={{ fontSize: 12.5, color: chosen.length >= g.cap && g.cap ? "#2E7D32" : "#B26A00" }}>{chosen.length} of {g.cap || "?"} slot(s) chosen · {g.options.length} option(s) in the list</span>
              <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => start(g)}>Choose from the list</button>
            </div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
              {g.slots.map((s) => { const c = choices.find((x) => x.courseId === s.id); return <li key={s.id}>{s.semester ? `S${s.semester} · ` : ""}<b>{s.code}</b> {s.title}{s.chosen ? <span className="small-note"> — chosen from the {name(g.flavour)} list{c ? ` by ${c.byName}, ${new Date(c.at).toLocaleDateString()}` : ""}</span> : s.open ? <span style={{ color: "#B26A00" }}> — empty slot</span> : null}{s.locked ? <span className="small-note"> (has students)</span> : null}</li>; })}
              {!g.slots.length && <li className="small-note">No slots in this batch yet — choosing creates them.</li>}
            </ul>
          </div>); })}
      </div>
      {open && (() => {
        const ql = q.toLowerCase();
        const opts = open.options.filter((o) => !ql || `${o.code} ${o.title} ${o.tracks.join(" ")}`.toLowerCase().includes(ql));
        const trackNames = Array.from(new Set(opts.flatMap((o) => (o.tracks.length ? o.tracks : ["Other"]))));
        const byTrack = trackNames.length > 1 ? trackNames.map((t) => ({ t, os: opts.filter((o) => (o.tracks.length ? o.tracks.includes(t) : t === "Other")) })) : [{ t: "", os: opts }];
        const over = open.cap > 0 && sel.size > open.cap;
        const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
        return (
          <div role="dialog" aria-modal="true" aria-label={`Choose ${name(open.flavour)} courses`} style={{ position: "fixed", inset: 0, background: "rgba(10,20,35,.45)", zIndex: 60, display: "grid", placeItems: "center", padding: 16 }} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
            <div className="card" style={{ width: "min(720px,100%)", maxHeight: "85vh", overflow: "auto", margin: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>Choose {open.cap || ""} {name(open.flavour)} course(s)</b>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: over ? "#B3261E" : "#2E7D32" }}>{sel.size}{open.cap ? ` / ${open.cap}` : ""} ticked</span>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setOpen(null)}>Close</button>
              </div>
              <p className="small-note">Each ticked course fills one {name(open.flavour)} slot of this batch (it counts once, as the slot) and comes with its plan. Untick to free a slot (not once it has students).</p>
              <input placeholder="Find — code, title or track…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an option" style={{ width: "100%", marginBottom: 8 }} />
              {byTrack.map(({ t, os }) => (
                <fieldset key={t || "all"} style={{ border: "none", padding: 0, margin: "0 0 8px" }}>
                  {t && <legend style={{ fontWeight: 700, fontSize: 12.5, color: "#0D2A4A" }}>{t}</legend>}
                  {os.map((o) => { const locked = open.slots.some((s) => s.chosen === o.id && s.locked); return (
                    <label key={`${t}-${o.id}`} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "3px 0", borderBottom: "1px solid #F0F2F5" }}>
                      <input type="checkbox" checked={sel.has(o.id)} disabled={locked || (!sel.has(o.id) && open.cap > 0 && sel.size >= open.cap)} onChange={() => toggle(o.id)} />
                      <span style={{ flex: 1 }}><b>{o.code}</b> {o.title}</span>
                      <span style={{ whiteSpace: "nowrap" }}>{o.ch} CH</span>
                      <span style={{ whiteSpace: "nowrap", color: o.clos ? "#2E7D32" : "#A0A6AD", fontSize: 11.5 }}>{o.clos ? `${o.clos} CLOs` : "no CLOs"}{o.lectures ? ` · ${o.lectures} lectures` : ""}</span>
                    </label>); })}
                </fieldset>))}
              {!opts.length && <p className="small-note">No option matches.</p>}
              {msg && !msg.ok && <p className="err">{msg.text}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff", paddingTop: 8 }}>
                <button type="button" className="btn" disabled={busy || over} onClick={save}>{busy ? "Saving…" : `Save ${sel.size} choice(s)`}</button>
              </div>
            </div>
          </div>);
      })()}
    </div>
  );
}
