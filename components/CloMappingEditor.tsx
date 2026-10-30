"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { checkWeights, limitBreaches, mappingIssues, type CItem, type Limit, type Method, type Part } from "../lib/cloMethodCore";

// Mapping each item to CLOs (with the marks split), "Not for CLO", "Excluded from attainment", the item's part and type,
// each CLO's part (theory / lab), and — under method 3 — the weights per CLO, checked live against the OMC's limits.

type Clo = { id: string; code: string; part: Part; statement: string };
type Row = CItem & { notForCloReason: string | null; excludedReason: string | null; typeKey: string | null; faultyReason: string | null };
async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/clo-method", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Could not save.");
  return j;
}

export default function CloMappingEditor({ courseId, source, items, clos, method, limits, types, hasLab, canEdit }: {
  courseId: string; source: "SE" | "INSTRUCTOR"; items: Row[]; clos: Clo[]; method: Method; limits: Limit[]; types: { key: string; name: string; part: string; defaultNotForClo: boolean; graded: boolean }[]; hasLab: boolean; canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const issues = useMemo(() => mappingIssues(items, clos, { hasLab, notForCloReasons: Object.fromEntries(items.map((i) => [i.id, i.notForCloReason])) }), [items, clos, hasLab]);
  const breaches = useMemo(() => limitBreaches(method, items, clos, limits), [method, items, clos, limits]);
  const code = (id: string) => clos.find((c) => c.id === id)?.code || "?";
  async function save(body: Record<string, unknown>, done = "Saved.") {
    setBusy(true); setMsg(null);
    try { await post({ courseId, source, ...body }); setMsg({ ok: true, text: done }); setOpen(null); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  const start = (it: Row) => { setOpen(it.id); setDraft({ splits: Object.fromEntries(clos.map((c) => [c.id, it.clos.find((x) => x.cloId === c.id)?.pct || 0])), part: it.part, typeKey: it.typeKey || "", notForClo: !!it.notForClo, notForCloReason: it.notForCloReason || "", excluded: !!it.excluded, excludedReason: it.excludedReason || "" }); };

  return (
    <div>
      {(issues.blocking.length > 0 || issues.warnings.length > 0 || breaches.length > 0) && (
        <div className="card" style={{ background: issues.blocking.length ? "#FDECEC" : "#FFF8E6" }} data-testid="clo-issues">
          {issues.blocking.map((t) => <p key={t} style={{ margin: "2px 0", fontSize: 13 }}>⛔ {t}</p>)}
          {breaches.map((b) => <p key={b.text} style={{ margin: "2px 0", fontSize: 13 }}>⚠ {b.text} — needs the OMC / HOD&apos;s approval</p>)}
          {issues.warnings.map((t) => <p key={t} style={{ margin: "2px 0", fontSize: 13 }}>⚠ {t}</p>)}
          {issues.blocking.length > 0 && <p className="small-note" style={{ margin: "4px 0 0" }}>The plan (and the paper, for unmapped questions) can&apos;t be submitted until the ⛔ items are fixed.</p>}
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>CLOs</h3>
        {clos.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 13, flexWrap: "wrap" }}>
            <b style={{ width: 56 }}>{c.code}</b>
            {canEdit ? <select value={c.part} onChange={(e) => save({ action: "cloPart", cloId: c.id, part: e.target.value })} disabled={busy}><option value="THEORY">Theory CLO</option><option value="LAB">Lab CLO</option></select> : <span>{c.part === "LAB" ? "Lab CLO" : "Theory CLO"}</span>}
            {items.some((i) => i.part === "LAB" && i.clos.some((x) => x.cloId === c.id)) && items.some((i) => i.part === "THEORY" && i.clos.some((x) => x.cloId === c.id)) && <span className="small-note">shared (theory + lab)</span>}
            <span className="small-note" style={{ flex: "1 1 300px" }}>{c.statement}</span>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Items and their CLOs</h3>
        <table className="table" style={{ width: "100%", fontSize: 13 }}>
          <thead><tr><th>Item</th><th>Part</th><th>Grade %</th><th>CLO (split)</th><th>Attainment</th><th></th></tr></thead>
          <tbody>{items.map((it) => (
            <tr key={it.id} data-item={it.label}>
              <td>{it.label}<div className="small-note">{types.find((t) => t.key === it.typeKey)?.name || it.type}{it.isQuestion ? " · question" : ""}</div></td>
              <td>{it.part === "LAB" ? "Lab" : "Theory"}</td>
              <td>{it.gradePct}</td>
              <td>{it.notForClo ? <span className="small-note">Not for CLO — {it.notForCloReason}</span> : it.clos.length ? it.clos.map((c) => `${code(c.cloId)}${it.clos.length > 1 ? ` ${c.pct}%` : ""}`).join(" + ") : <b style={{ color: "#B3261E" }}>not mapped</b>}</td>
              <td className="small-note">{it.faulty ? `Faulty — ${it.faultyReason || ""}` : it.excluded ? `Excluded — ${it.excludedReason}` : it.notForClo ? "grade only" : "counts"}</td>
              <td>{canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => (open === it.id ? setOpen(null) : start(it))}>{open === it.id ? "Close" : "Edit"}</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {open && (() => {
          const it = items.find((x) => x.id === open)!;
          const splits = draft.splits as Record<string, number>;
          const sum = Object.values(splits).reduce((a, b) => a + Number(b || 0), 0);
          return (
            <div style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 10, marginTop: 8 }}>
              <b>{it.label}</b>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "6px 0" }}>
                {clos.map((c) => <label key={c.id} style={{ fontSize: 12, display: "grid", gap: 2 }}>{c.code} %<input type="number" min={0} max={100} value={splits[c.id] || 0} onChange={(e) => setDraft((d) => ({ ...d, splits: { ...splits, [c.id]: Number(e.target.value) } }))} style={{ width: 70 }} /></label>)}
                <span className="small-note" style={{ alignSelf: "end", color: Math.abs(sum - 100) < 0.01 ? "var(--sage)" : "var(--rust)" }}>adds up to {sum}%</span>
                <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "end" }} onClick={() => { const on = clos.filter((c) => splits[c.id] > 0); if (on.length) { const eq = Math.floor(10000 / on.length) / 100; setDraft((d) => ({ ...d, splits: Object.fromEntries(clos.map((c, i) => [c.id, splits[c.id] > 0 ? (i === clos.indexOf(on[0]) ? Math.round((100 - eq * (on.length - 1)) * 100) / 100 : eq) : 0])) })); } }}>Split equally</button>
                <button type="button" className="btn btn-brass btn-sm" style={{ alignSelf: "end" }} disabled={busy || Math.abs(sum - 100) > 0.01} onClick={() => save({ action: "item", instrumentId: it.id, splits: clos.filter((c) => splits[c.id] > 0).map((c) => ({ cloId: c.id, pct: splits[c.id] })) }, "Mapping saved.")}>Save mapping</button>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "6px 0" }}>
                <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Part<select value={String(draft.part)} onChange={(e) => setDraft((d) => ({ ...d, part: e.target.value }))}><option value="THEORY">Theory</option><option value="LAB">Lab</option></select></label>
                <label style={{ fontSize: 12, display: "grid", gap: 2 }}>Type<select value={String(draft.typeKey)} onChange={(e) => setDraft((d) => ({ ...d, typeKey: e.target.value }))}><option value="">({it.type})</option>{types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save({ action: "item", instrumentId: it.id, part: draft.part, typeKey: draft.typeKey })}>Save part / type</button>
              </div>
              {!it.isQuestion && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", margin: "6px 0" }}>
                  <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={!!draft.notForClo} onChange={(e) => setDraft((d) => ({ ...d, notForClo: e.target.checked }))} />Not for CLO (grade only)</label>
                  <input placeholder="Reason, e.g. bonus quiz" value={String(draft.notForCloReason)} onChange={(e) => setDraft((d) => ({ ...d, notForCloReason: e.target.value }))} style={{ width: 240 }} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save({ action: "item", instrumentId: it.id, notForClo: draft.notForClo, notForCloReason: draft.notForCloReason })}>Save</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", margin: "6px 0" }}>
                <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={!!draft.excluded} onChange={(e) => setDraft((d) => ({ ...d, excluded: e.target.checked }))} />Exclude from CLO attainment (still in the grade and coverage)</label>
                <input placeholder="Reason" value={String(draft.excludedReason)} onChange={(e) => setDraft((d) => ({ ...d, excludedReason: e.target.value }))} style={{ width: 240 }} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save({ action: "item", instrumentId: it.id, excluded: draft.excluded, excludedReason: draft.excludedReason })}>Save</button>
              </div>
            </div>
          );
        })()}
        {msg && <p className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</p>}
      </div>
      {method === "WEIGHTS" && <WeightsEditor courseId={courseId} source={source} items={items} clos={clos} limits={limits} canEdit={canEdit} />}
    </div>
  );
}

/** Method 3: weights per CLO, entered by the SE, adding up to 100 and within the OMC's limits — checked as you type. */
function WeightsEditor({ courseId, source, items, clos, limits, canEdit }: { courseId: string; source: string; items: Row[]; clos: Clo[]; limits: Limit[]; canEdit: boolean }) {
  const router = useRouter();
  const [w, setW] = useState<Record<string, Record<string, number>>>(() => Object.fromEntries(clos.map((c) => [c.id, Object.fromEntries(items.filter((i) => i.clos.some((x) => x.cloId === c.id)).map((i) => [i.id, i.weights?.[c.id] ?? 0]))])));
  const [msg, setMsg] = useState<Record<string, string>>({});
  return (
    <div className="card" style={{ overflowX: "auto" }} data-testid="weights-editor">
      <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Method 3 — weights within each CLO</h3>
      {clos.map((c) => {
        const mine = items.filter((i) => i.clos.some((x) => x.cloId === c.id));
        const test = items.map((i) => ({ ...i, weights: { ...(i.weights || {}), [c.id]: w[c.id]?.[i.id] ?? 0 } }));
        const err = checkWeights(test, c, limits);
        return (
          <div key={c.id} style={{ borderTop: "1px solid #eee", padding: "6px 0" }}>
            <b>{c.code}</b>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0" }}>
              {mine.map((i) => <label key={i.id} style={{ fontSize: 12, display: "grid", gap: 2 }}>{i.label}<input type="number" min={0} max={100} value={w[c.id]?.[i.id] ?? 0} disabled={!canEdit} onChange={(e) => setW((x) => ({ ...x, [c.id]: { ...x[c.id], [i.id]: Number(e.target.value) } }))} style={{ width: 70 }} /></label>)}
            </div>
            <span className="small-note" style={{ color: err ? "var(--rust)" : "var(--sage)" }}>{err || "Adds up to 100 and keeps within the limits."}</span>{" "}
            {canEdit && <button type="button" className="btn btn-brass btn-sm" disabled={!!err} onClick={async () => { try { await post({ action: "weights", courseId, source, cloId: c.id, weights: w[c.id] }); setMsg((m) => ({ ...m, [c.id]: "Saved." })); router.refresh(); } catch (e) { setMsg((m) => ({ ...m, [c.id]: (e as Error).message })); } }}>Save {c.code} weights</button>}
            {msg[c.id] && <span className="small-note"> {msg[c.id]}</span>}
          </div>
        );
      })}
    </div>
  );
}
