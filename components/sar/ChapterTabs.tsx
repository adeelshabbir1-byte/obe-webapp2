"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionForm } from "../fyp/FypClient";
import { Bar, Chip, ORDER, STATE } from "./SarTabs";
import type { ItemState, ItemStatus } from "../../lib/sarStatus";

type Ch = { key: string; title: string; prompt: string; text: string; gaps: string[] };

/** A visit cycle's SAR as tabs, one per chapter, coloured by where each chapter stands. */
export default function ChapterTabs({ cycleId, chapters, statuses, canEdit, userId }: { cycleId: string; chapters: Ch[]; statuses: Record<string, ItemStatus & { dataGaps: number }>; canEdit: boolean; userId: string }) {
  const router = useRouter();
  const [key, setKey] = useState(chapters.find((c) => statuses[c.key]?.ownerId === userId)?.key || chapters[0]?.key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const counts: Record<ItemState, number> = { none: 0, progress: 0, entered: 0, ready: 0, changed: 0, restricted: 0 };
  for (const c of chapters) counts[statuses[c.key]?.state || "none"]++;
  const i = Math.max(0, chapters.findIndex((c) => c.key === key));
  const ch = chapters[i], st = ch ? statuses[ch.key] : null;

  async function mark(ready: boolean) {
    setBusy(true); setErr("");
    const res = await fetch("/api/accreditation/sar-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle: cycleId, item: ch.key, ready }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "Could not save."); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="card">
        <b>{counts.ready} of {chapters.length} chapters ready</b>
        <div style={{ marginTop: 8 }}><Bar counts={counts} total={chapters.length} /></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>{ORDER.map((s) => <span key={s} className="small-note" title={STATE[s].about}><Chip s={s} /> {counts[s]}</span>)}</div>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 12 }}>
        {chapters.map((c, n) => {
          const s = statuses[c.key]?.state || "none", d = STATE[s], on = c.key === ch?.key;
          return (
            <button key={c.key} role="tab" aria-selected={on} type="button" title={`${c.title} — ${d.label}`} onClick={() => setKey(c.key)}
              style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 6, color: on ? "#fff" : d.color, background: on ? d.color : d.bg, border: `1px solid ${d.color}${on ? "" : "66"}` }}>
              {n + 1}. {c.title.replace(/^(Criterion|Form) [\d &]+ — /, "").slice(0, 34)}{statuses[c.key]?.dataGaps ? ` · ${statuses[c.key].dataGaps}` : ""}
            </button>
          );
        })}
      </div>
      {ch && st && (
        <div className="card" style={{ borderTop: `3px solid ${STATE[st.state].color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ maxWidth: 820 }}>
              <div style={{ fontSize: 15 }}><b>{i + 1}. {ch.title}</b> <Chip s={st.state} /></div>
              <div className="small-note" style={{ marginTop: 4 }}>
                {st.owner ? <>With <b>{st.owner}</b>{st.due ? ` · due ${st.due}` : ""} · task {st.taskCode} ({(st.taskStatus || "").toLowerCase()})</> : st.taskId ? <>Task {st.taskCode} is not assigned yet</> : <>No task covers this chapter</>}
                {st.readyAt && <> · {st.state === "changed" ? "was marked ready" : "ready"} {st.readyAt}{st.readyBy ? ` by ${st.readyBy}` : ""}</>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {st.taskId && <Link href={`/accreditation/tasks/${st.taskId}`} className="btn btn-secondary btn-sm">{st.owner ? "Open task" : "Assign"}</Link>}
              {canEdit && (st.state === "ready"
                ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => mark(false)}>Open again</button>
                : <button type="button" className="btn btn-brass btn-sm" disabled={busy || !ch.text.trim()} title={ch.text.trim() ? "" : "Write the narrative first"} onClick={() => mark(true)}>{st.state === "changed" ? "Approve changes" : "Mark ready"}</button>)}
            </div>
          </div>
          {st.state === "changed" && <p className="small-note" style={{ color: STATE.changed.color, margin: "6px 0 0" }}>The narrative or the missing data changed after this chapter was approved. Check it and approve again.</p>}
          {err && <p className="small-note" style={{ color: "var(--rust)", margin: "6px 0 0" }}>{err}</p>}
          {ch.gaps.length > 0 && <div style={{ borderLeft: "4px solid #B3261E", paddingLeft: 10, margin: "10px 0" }}><b style={{ fontSize: 13 }}>Data still missing</b><ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>{ch.gaps.map((g, n) => <li key={n}>{g}</li>)}</ul></div>}
          <div className="small-note" style={{ marginTop: 8 }}>{ch.prompt}</div>
          {ch.text ? <div style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: "6px 0" }}>{ch.text}</div> : <p className="small-note" style={{ color: "#B3261E" }}>Narrative not written yet.</p>}
          {canEdit && <ActionForm key={ch.key} url={`/api/accreditation/sar/${cycleId}`} fixed={{ sectionKey: ch.key }} submit="Save" collapsed openLabel={ch.text ? "Edit" : "Write"} initial={{ text: ch.text }} fields={[{ name: "text", label: ch.title, type: "textarea" }]} />}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={i <= 0} onClick={() => setKey(chapters[i - 1].key)}>← Previous</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={i >= chapters.length - 1} onClick={() => setKey(chapters[i + 1].key)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
