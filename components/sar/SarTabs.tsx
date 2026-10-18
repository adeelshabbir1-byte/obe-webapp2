"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NarrativeEditor from "./NarrativeEditor";
import type { Item } from "../../lib/nbeacSar";
import type { ItemState, ItemStatus } from "../../lib/sarStatus";

// The council SAR as tabs: a tab per form, and inside it a tab per table / question, each coloured by where it stands.

type KItem = Item & { key: string };
type Form = { key: string; title: string; weight: string; items: KItem[] };

export const STATE: Record<ItemState, { label: string; color: string; bg: string; about: string }> = {
  none: { label: "Not assigned", color: "#8a9099", bg: "rgba(138,144,153,.16)", about: "nobody has it yet and it is empty" },
  progress: { label: "In progress", color: "#c98a0b", bg: "rgba(224,165,38,.20)", about: "assigned, data not in yet" },
  entered: { label: "Entered", color: "#2f6fd6", bg: "rgba(59,130,246,.18)", about: "data in, waiting for review" },
  ready: { label: "Ready", color: "#23894f", bg: "rgba(46,157,91,.20)", about: "approved and unchanged" },
  changed: { label: "Changed", color: "#c93c3c", bg: "rgba(214,69,69,.18)", about: "was ready, data changed since — look again" },
  restricted: { label: "Confidential", color: "#8a9099", bg: "transparent", about: "not shown to you" },
};
export const ORDER: ItemState[] = ["ready", "entered", "progress", "changed", "none"];

export function Chip({ s }: { s: ItemState }) {
  const d = STATE[s];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: d.color, background: d.bg, border: `1px solid ${d.color}55`, borderRadius: 999, padding: "1px 9px" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: d.color }} />{d.label}</span>;
}

export function Bar({ counts, total }: { counts: Record<ItemState, number>; total: number }) {
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--line)" }}>
      {ORDER.map((s) => counts[s] ? <div key={s} title={`${STATE[s].label}: ${counts[s]}`} style={{ width: `${(100 * counts[s]) / Math.max(1, total)}%`, background: STATE[s].color }} /> : null)}
    </div>
  );
}

function count(items: KItem[], st: Record<string, ItemStatus>) {
  const c: Record<ItemState, number> = { none: 0, progress: 0, entered: 0, ready: 0, changed: 0, restricted: 0 };
  for (const it of items) c[st[it.key]?.state || "none"]++;
  return c;
}

function Content({ it, scopeKey, canWrite }: { it: KItem; scopeKey: string; canWrite: boolean }) {
  if (it.status === "restricted") return <p className="small-note">{it.note}</p>;
  return (
    <div>
      {it.note && <p className="small-note" style={{ margin: "0 0 8px" }}>{it.note}</p>}
      {it.kind === "narrative" && <NarrativeEditor scopeKey={scopeKey} code={it.code} initial={it.text || ""} canEdit={canWrite} />}
      {it.kind === "appendix" && (it.files?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{it.files.map((f) => <li key={f.id}>{f.fileName ? <a href={`/api/accreditation?file=${f.id}`}>{f.title}</a> : f.title}{f.approvedBy ? ` — approved by ${f.approvedBy}` : ""}{f.date ? `, ${f.date}` : ""}{!f.fileName && <span className="small-note"> (no document attached)</span>}</li>)}</ul>
      ) : <p className="small-note" style={{ margin: 0 }}>No approved document recorded under Policies & manuals for this appendix.</p>)}
      {it.kind === "table" && (it.rows && it.rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr>{it.columns!.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
            <tbody>{it.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ whiteSpace: typeof c === "string" && c.length > 60 ? "pre-wrap" : undefined }}>{c === null || c === "" ? "—" : String(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="small-note" style={{ margin: 0 }}>No rows yet. {it.fill ? "Use “Fill in” to add the data where it is kept." : ""}</p>)}
    </div>
  );
}

export default function SarTabs({ forms, statuses, scopeKey, userId, canWrite, canApprove, initialForm }: {
  forms: Form[]; statuses: Record<string, ItemStatus>; scopeKey: string; userId: string; canWrite: boolean; canApprove: boolean; initialForm?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "mine" | "attention">("all");
  const [formKey, setFormKey] = useState(forms.some((f) => f.key === initialForm) ? initialForm! : forms[0]?.key);
  const [itemKey, setItemKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const keep = (it: KItem) => {
    const s = statuses[it.key];
    if (filter === "mine") return s?.ownerId === userId;
    if (filter === "attention") return ["none", "progress", "changed"].includes(s?.state || "none");
    return true;
  };
  const shown = useMemo(() => forms.map((f) => ({ ...f, items: f.items.filter(keep) })), [forms, filter, statuses]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = forms.flatMap((f) => f.items).filter((i) => statuses[i.key]?.state !== "restricted");
  const total = count(all, statuses);
  const form = shown.find((f) => f.key === formKey) || shown[0];
  const items = form?.items || [];
  const item = items.find((i) => i.key === itemKey) || items[0] || null;
  const st = item ? statuses[item.key] : null;
  const idx = item ? items.indexOf(item) : -1;
  const mine = forms.flatMap((f) => f.items).filter((i) => statuses[i.key]?.ownerId === userId).length;

  async function mark(ready: boolean) {
    if (!item) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/accreditation/sar-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dept: scopeKey, item: item.key, ready }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "Could not save."); return; }
    router.refresh();
  }

  return (
    <div>
      {/* Overall */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
          <b>{total.ready} of {all.length} tables ready ({all.length ? Math.round((100 * total.ready) / all.length) : 0}%)</b>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([["all", "All tables"], ["mine", `My tables (${mine})`], ["attention", "Needs attention"]] as const).map(([k, l]) => (
              <button key={k} type="button" className={`btn btn-sm ${filter === k ? "btn-brass" : "btn-secondary"}`} onClick={() => { setFilter(k); setItemKey(null); }}>{l}</button>
            ))}
          </div>
        </div>
        <Bar counts={total} total={all.length} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          {ORDER.map((s) => <span key={s} className="small-note" title={STATE[s].about}><Chip s={s} /> {total[s]}</span>)}
        </div>
      </div>

      {/* Form tabs */}
      <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "2px solid var(--line)", marginTop: 12 }}>
        {shown.map((f) => {
          const full = forms.find((x) => x.key === f.key)!;
          const c = count(full.items.filter((i) => statuses[i.key]?.state !== "restricted"), statuses);
          const n = full.items.filter((i) => statuses[i.key]?.state !== "restricted").length;
          const active = f.key === form?.key;
          return (
            <button key={f.key} role="tab" aria-selected={active} type="button" onClick={() => { setFormKey(f.key); setItemKey(null); }}
              style={{ border: "1px solid var(--line)", borderBottom: active ? "2px solid var(--brass, #b08d3c)" : "1px solid var(--line)", background: active ? "var(--card, #fff)" : "transparent", borderRadius: "8px 8px 0 0", padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, color: "inherit", minWidth: 150, textAlign: "left", marginBottom: -2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{f.title.replace(/^Form (\d): /, "$1 · ")}</span>
                <span style={{ fontSize: 12 }}>{c.changed ? <span style={{ color: STATE.changed.color }}>●</span> : null} {c.ready}/{n}</span>
              </div>
              <div style={{ marginTop: 4 }}><Bar counts={c} total={n} /></div>
              {filter !== "all" && <div className="small-note" style={{ marginTop: 2 }}>{f.items.length} shown</div>}
            </button>
          );
        })}
      </div>

      {form && (
        <div className="card" style={{ borderTopLeftRadius: 0 }}>
          <div className="small-note" style={{ marginBottom: 6 }}>{form.title} · weight {form.weight}</div>
          {/* Table tabs */}
          {items.length === 0 ? <p className="small-note">Nothing here for this filter.</p> : (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
              {items.map((it) => {
                const s = statuses[it.key]?.state || "none", d = STATE[s], on = it.key === item?.key;
                return (
                  <button key={it.key} type="button" title={`${it.question} — ${d.label}`} onClick={() => setItemKey(it.key)}
                    style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, color: on ? "#fff" : d.color, background: on ? d.color : d.bg, border: `1px solid ${d.color}${on ? "" : "66"}`, outline: on ? `2px solid ${d.color}55` : "none", outlineOffset: 1 }}>
                    {it.code}
                  </button>
                );
              })}
            </div>
          )}

          {item && st && (
            <div style={{ borderTop: `3px solid ${STATE[st.state].color}`, paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ maxWidth: 820 }}>
                  <div style={{ fontSize: 15 }}><b>{item.code}</b> <Chip s={st.state} /></div>
                  <div style={{ fontSize: 13.5, marginTop: 3 }}>{item.question}</div>
                  <div className="small-note" style={{ marginTop: 4 }}>
                    {st.owner ? <>With <b>{st.owner}</b>{st.due ? ` · due ${st.due}` : ""} · task {st.taskCode} ({(st.taskStatus || "").toLowerCase()})</> : st.taskId ? <>Task {st.taskCode} is not assigned to anyone yet</> : <>No accreditation task covers this table yet</>}
                    {st.readyAt && <> · {st.state === "changed" ? "was marked ready" : "ready"} {st.readyAt}{st.readyBy ? ` by ${st.readyBy}` : ""}</>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.fill && item.status !== "restricted" && <Link href={item.fill} className="btn btn-secondary btn-sm">Fill in →</Link>}
                  {st.taskId ? <Link href={`/accreditation/tasks/${st.taskId}`} className="btn btn-secondary btn-sm">{st.owner ? "Open task" : "Assign"}</Link>
                    : st.cycleId ? null : <Link href="/accreditation/readiness" className="btn btn-secondary btn-sm">Assign via visit readiness</Link>}
                  {canApprove && item.status === "filled" && (st.state === "ready"
                    ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => mark(false)}>Open again</button>
                    : <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => mark(true)}>{st.state === "changed" ? "Approve changes" : "Mark ready"}</button>)}
                </div>
              </div>
              {st.state === "changed" && <p className="small-note" style={{ color: STATE.changed.color, margin: "6px 0 0" }}>The data under this table changed after it was approved. Check it and approve again.</p>}
              {err && <p className="small-note" style={{ color: "var(--rust)", margin: "6px 0 0" }}>{err}</p>}
              <div style={{ marginTop: 10 }}><Content it={item} scopeKey={scopeKey} canWrite={canWrite} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={idx <= 0} onClick={() => setItemKey(items[idx - 1].key)}>← {idx > 0 ? items[idx - 1].code : ""}</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={idx >= items.length - 1} onClick={() => setItemKey(items[idx + 1].key)}>{idx < items.length - 1 ? items[idx + 1].code : ""} →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
