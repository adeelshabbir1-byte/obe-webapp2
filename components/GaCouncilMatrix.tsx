"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CouncilSet } from "../lib/councilAttributes";

type Ga = { id: string; number: number; title: string; description: string; status: string };

/** Program GAs (rows) × council attributes (columns): tick which attribute each GA stands for. */
export default function GaCouncilMatrix({ batchId, set, gas, initial, canEdit }: { batchId: string; set: CouncilSet; gas: Ga[]; initial: Record<string, number[]>; canEdit: boolean }) {
  const router = useRouter();
  const [map, setMap] = useState<Record<string, number[]>>(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/ga-council-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, body: set.key, ...payload }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Could not save.");
    return d;
  }
  async function toggle(ga: Ga, n: number) {
    const cur = map[ga.id] || [];
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b);
    setMap({ ...map, [ga.id]: next }); setMsg("");
    try { await post({ action: "map", ploId: ga.id, attrs: next }); } catch (e) { setMap({ ...map, [ga.id]: cur }); setMsg((e as Error).message); }
  }
  async function run(action: "load" | "auto") {
    setBusy(action); setMsg("");
    try {
      const d = await post({ action });
      setMsg(action === "load" ? `${d.created} GA${d.created === 1 ? "" : "s"} added${d.mapped ? `, ${d.mapped} matched by title` : ""}.` : `${d.mapped} GA${d.mapped === 1 ? "" : "s"} matched by title.`);
      router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }

  const covered = (n: number) => gas.filter((g) => (map[g.id] || []).includes(n));
  const uncovered = set.attrs.filter((a) => covered(a.n).length === 0);
  const unmapped = gas.filter((g) => !(map[g.id] || []).length);
  const code = (n: number) => `${set.prefix}-${n}`;

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <b style={{ color: uncovered.length ? "#c93c3c" : "#23894f" }}>{set.attrs.length - uncovered.length} of {set.attrs.length} {set.prefix}s covered</b>
            <span className="small-note"> · {gas.length - unmapped.length} of {gas.length} GAs mapped</span>
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {gas.length > 0 && <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run("auto")}>{busy === "auto" ? "Matching…" : "Match by title"}</button>}
              <button type="button" className="btn btn-brass btn-sm" disabled={!!busy} onClick={() => run("load")} title={`Adds each ${set.prefix} the batch doesn't have yet as a GA, with its full statement`}>
                {busy === "load" ? "Loading…" : gas.length ? `Add missing ${set.prefix}s as GAs` : `Load the ${set.attrs.length} ${set.prefix}s as this batch's GAs`}
              </button>
            </div>
          )}
        </div>
        {uncovered.length > 0 && <p className="small-note" style={{ color: "#c93c3c", margin: "6px 0 0" }}>Not covered by any GA: {uncovered.map((a) => `${code(a.n)} ${a.title}`).join(" · ")}</p>}
        {unmapped.length > 0 && gas.length > 0 && <p className="small-note" style={{ color: "#c98a0b", margin: "4px 0 0" }}>GAs not mapped to any {set.prefix}: {unmapped.map((g) => `GA-${g.number} ${g.title}`).join(" · ")}</p>}
        {msg && <p className="small-note" style={{ margin: "6px 0 0" }}>{msg}</p>}
      </div>
      {gas.length === 0 ? <div className="card"><p className="small-note" style={{ margin: 0 }}>This batch has no GAs yet{canEdit ? ` — load the ${set.prefix}s above to start from the council's own list.` : "."}</p></div> : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Program GA</th>
                {set.attrs.map((a) => <th key={a.n} title={`${a.title}: ${a.statement}`} style={{ textAlign: "center", whiteSpace: "nowrap" }}>{code(a.n)}<div className="small-note" style={{ fontWeight: 400, maxWidth: 80, whiteSpace: "normal", lineHeight: 1.2 }}>{a.title}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {gas.map((g) => (
                <tr key={g.id}>
                  <td title={g.description}><b>GA-{g.number}</b> {g.title}{g.status !== "approved" && <span className="small-note"> ({g.status})</span>}</td>
                  {set.attrs.map((a) => {
                    const on = (map[g.id] || []).includes(a.n);
                    return (
                      <td key={a.n} style={{ textAlign: "center", background: on ? "rgba(46,157,91,.16)" : undefined }}>
                        <input type="checkbox" checked={on} disabled={!canEdit} onChange={() => toggle(g, a.n)} aria-label={`GA-${g.number} maps to ${code(a.n)}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="small-note"><b>Covered by</b></td>
                {set.attrs.map((a) => { const c = covered(a.n).length; return <td key={a.n} style={{ textAlign: "center", fontWeight: 700, color: c ? "#23894f" : "#c93c3c" }}>{c || "✕"}</td>; })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
