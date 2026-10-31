"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BLOOM_NAMES, KINDS, blueprintCheck, type Blueprint } from "../lib/examBoardCore";

// Client pieces of the team exam board: the question form (all mandatory metadata, duplicate warning), the draft
// picker with a live blueprint check, the 5-star rating, and the Course Lead's pick.

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/exam-board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: Record<string, any> };
}
const toBase64 = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1] || ""); r.onerror = () => reject(new Error("Could not read the file")); r.readAsDataURL(f); });
const lbl = { fontSize: 12, display: "grid", gap: 3 } as const;

export type FormQ = { id?: string; text?: string; marks?: number; kind?: string; bloom?: string; difficulty?: string | null; cloCodes?: string[]; lectureNumber?: number | null; rubric?: string | null; options?: string[]; correctIndex?: number | null; codeSnippet?: string | null; hasImage?: boolean };
export function QuestionForm({ scope, lectures, clos, initial, examType, openLabel = "+ Add a question" }: {
  scope: { team?: string; courseCode?: string }; lectures: { lectureNumber: number; week: number; topic: string }[]; clos: { code: string; statement: string }[]; initial?: FormQ; examType?: string; openLabel?: string;
}) {
  const router = useRouter();
  const edit = !!initial?.id;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<FormQ>(initial || { kind: "SHORT", bloom: "C3", difficulty: "MEDIUM", marks: 5, cloCodes: [], lectureNumber: null });
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dups, setDups] = useState<{ id: string; text: string; similarity: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormQ, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  async function save(force = false, toDraft = false) {
    setBusy(true); setMsg(null);
    if (file && file.size > 1024 * 1024) { setMsg({ ok: false, text: "The diagram is larger than 1 MB." }); setBusy(false); return; }
    const image = file ? { type: file.type, data: await toBase64(file) } : null;
    const r = await post({ action: edit ? "editQuestion" : "addQuestion", ...scope, ...v, options: (v.options || []), image, removeImage, force, toDraft: toDraft || undefined, exam: examType });
    setBusy(false);
    if (r.data.duplicates) { setDups(r.data.duplicates); return; }
    if (!r.ok) { setMsg({ ok: false, text: r.data.error || "Could not save." }); return; }
    setDups(null); setMsg({ ok: true, text: r.data.message || "Saved." });
    if (!edit) { setV({ kind: v.kind, bloom: v.bloom, difficulty: v.difficulty, marks: v.marks, cloCodes: [], lectureNumber: v.lectureNumber }); setFile(null); }
    else setOpen(false);
    router.refresh();
  }
  async function reuse(id: string) {
    if (!scope.team || !examType) return;
    setBusy(true);
    const cur = await post({ action: "saveDraft", ...scope, exam: examType, itemIds: [...(window as unknown as { __draftIds?: string[] }).__draftIds || [], id] });
    setBusy(false);
    setMsg(cur.ok ? { ok: true, text: "The existing question was added to your draft." } : { ok: false, text: cur.data.error });
    setDups(null); router.refresh();
  }
  if (!open) return <button type="button" className={edit ? "btn btn-secondary btn-sm" : "btn btn-brass btn-sm"} onClick={() => setOpen(true)} data-testid={edit ? "edit-question" : "add-question"}>{edit ? "Edit" : openLabel}</button>;
  return (
    <div style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 12, margin: "8px 0", display: "grid", gap: 10 }} data-testid="question-form">
      <label style={lbl}>Question statement<textarea name="text" rows={3} value={v.text || ""} onChange={(e) => set("text", e.target.value)} style={{ width: "100%" }} /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={lbl}>Topic (lecture plan)<select name="lectureNumber" value={v.lectureNumber ?? ""} onChange={(e) => set("lectureNumber", e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 360 }}><option value="">— choose —</option>{lectures.map((l) => <option key={l.lectureNumber} value={l.lectureNumber}>W{l.week} · L{l.lectureNumber} · {l.topic.slice(0, 70)}</option>)}</select></label>
        <label style={lbl}>Kind<select name="kind" value={v.kind} onChange={(e) => set("kind", e.target.value)}>{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label style={lbl}>Difficulty<select name="difficulty" value={v.difficulty || ""} onChange={(e) => set("difficulty", e.target.value)}><option value="">—</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
        <label style={lbl}>Bloom level<select name="bloom" value={v.bloom} onChange={(e) => set("bloom", e.target.value)}>{Object.entries(BLOOM_NAMES).map(([k, n]) => <option key={k} value={k}>{k} {n}</option>)}</select></label>
        <label style={lbl}>Marks<input name="marks" type="number" step="any" value={v.marks ?? ""} onChange={(e) => set("marks", Number(e.target.value))} style={{ width: 80 }} /></label>
      </div>
      <div style={{ fontSize: 12 }}>CLOs (at least one):{" "}
        {clos.map((c) => <label key={c.code} title={c.statement} style={{ marginRight: 10, display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" name={`clo-${c.code}`} checked={(v.cloCodes || []).includes(c.code)} onChange={(e) => set("cloCodes", e.target.checked ? [...(v.cloCodes || []), c.code] : (v.cloCodes || []).filter((x) => x !== c.code))} />{c.code}</label>)}
        {!clos.length && <span className="small-note">The course has no CLOs yet.</span>}
      </div>
      {v.kind === "MCQ" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ ...lbl, flex: "1 1 320px" }}>Options (one per line)<textarea name="options" rows={4} value={(v.options || []).join("\n")} onChange={(e) => set("options", e.target.value.split("\n"))} /></label>
          <label style={lbl}>Correct option<select name="correctIndex" value={v.correctIndex ?? ""} onChange={(e) => set("correctIndex", e.target.value === "" ? null : Number(e.target.value))}><option value="">—</option>{(v.options || []).filter((o) => o.trim()).map((o, i) => <option key={i} value={i}>{String.fromCharCode(97 + i)}) {o.slice(0, 40)}</option>)}</select></label>
        </div>
      ) : <label style={lbl}>Rubric / model answer<textarea name="rubric" rows={3} value={v.rubric || ""} onChange={(e) => set("rubric", e.target.value)} /></label>}
      {(v.kind === "CODE" || v.codeSnippet) && <label style={lbl}>Code snippet<textarea name="codeSnippet" rows={4} value={v.codeSnippet || ""} onChange={(e) => set("codeSnippet", e.target.value)} style={{ fontFamily: "monospace" }} /></label>}
      <label style={lbl}>Diagram (PNG, JPEG, WebP or GIF, up to 1 MB){initial?.hasImage && !removeImage ? <span className="small-note">Has a diagram — <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRemoveImage(true)}>Remove it</button></span> : null}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      {dups && (
        <div className="card" style={{ borderLeft: "4px solid #B76E00", margin: 0 }} data-testid="duplicates">
          <b>A near-identical question is already in the bank</b>
          {dups.map((d) => <p key={d.id} style={{ margin: "4px 0", fontSize: 13 }}>{Math.round(d.similarity * 100)}% alike: <i>{d.text.slice(0, 220)}</i> {scope.team && examType && <button type="button" className="btn btn-secondary btn-sm" onClick={() => reuse(d.id)}>Use this one in my draft</button>}</p>)}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save(true)}>Add mine anyway</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save(false)}>{busy ? "…" : edit ? "Save" : "Add to the bank"}</button>
        {!edit && scope.team && examType && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save(false, true)}>Add and put in my {examType.toLowerCase()} draft</button>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setDups(null); }}>Close</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }} data-testid="qform-msg">{msg.text}</span>}
      </div>
    </div>
  );
}

export type PickQ = { id: string; text: string; marks: number; difficulty: "EASY" | "MEDIUM" | "HARD" | null; cloCodes: string[]; bloom: string; lectureNumber: number | null; week: number | null; topic: string; mine: boolean; complete: boolean };
/** Choose bank questions for the draft; the blueprint is checked as you pick. */
export function DraftPicker({ team, examType, bank, chosen, bp, ctx, status, locked }: {
  team: string; examType: string; bank: PickQ[]; chosen: string[]; bp: Blueprint; ctx: { requiredClos: string[]; minQuestions?: number; midtermWeek?: number | null; examType: string }; status: string | null; locked: boolean;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>(chosen);
  const [f, setF] = useState({ clo: "", difficulty: "", topic: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (typeof window !== "undefined") (window as unknown as { __draftIds?: string[] }).__draftIds = ids;
  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const check = blueprintCheck(ids.map((id) => byId.get(id)!).filter(Boolean), bp, ctx);
  const shown = bank.filter((q) => (!f.clo || q.cloCodes.includes(f.clo)) && (!f.difficulty || q.difficulty === f.difficulty) && (!f.topic || `${q.topic} L${q.lectureNumber}`.toLowerCase().includes(f.topic.toLowerCase())));
  const clos = Array.from(new Set(bank.flatMap((q) => q.cloCodes))).sort();
  async function go(action: "saveDraft" | "submitDraft") {
    setBusy(true); setMsg(null);
    if (action === "submitDraft") { const s = await post({ action: "saveDraft", team, exam: examType, itemIds: ids }); if (!s.ok) { setBusy(false); setMsg({ ok: false, text: s.data.error }); return; } }
    const r = await post({ action, team, exam: examType, itemIds: ids });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.data.error });
    router.refresh();
  }
  return (
    <div data-testid="draft-picker">
      <div className="card" data-testid="blueprint-check" style={{ borderLeft: `5px solid ${check.ok ? "#2F7A4D" : "#B3261E"}` }}>
        <b>Blueprint check — {check.total} marks, {ids.length} question(s)</b>{status && <span className="small-note"> · your draft is {status === "SUBMITTED" ? "submitted" : "saved, not submitted"}</span>}
        <p style={{ margin: "4px 0", fontSize: 13 }}>Easy {check.mix.EASY}% (target {bp.easyPct}) · Medium {check.mix.MEDIUM}% (target {bp.mediumPct}) · Hard {check.mix.HARD}% (target {bp.hardPct}) · ± {bp.tolerancePct}</p>
        <p style={{ margin: "4px 0", fontSize: 13 }}>{check.perClo.map((p) => `${p.code} ${p.pct}%${p.required ? "" : " (optional)"}`).join(" · ") || "No CLOs yet."}</p>
        {check.fails.map((x, i) => <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "#B3261E" }}>⛔ {x}</p>)}
        {check.warns.map((x, i) => <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "#B76E00" }}>⚠ {x}</p>)}
      </div>
      {!locked && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => go("saveDraft")}>Save draft</button>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy || !check.ok} onClick={() => go("submitDraft")} data-testid="submit-draft">Submit for peer review</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", margin: "8px 0", fontSize: 12 }}>
        <label style={lbl}>CLO<select value={f.clo} onChange={(e) => setF({ ...f, clo: e.target.value })}><option value="">All</option>{clos.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label style={lbl}>Difficulty<select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="">All</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
        <label style={lbl}>Topic<input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="search" /></label>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 12.5, width: "100%" }}>
          <thead><tr><th></th><th>Question</th><th>Topic</th><th>CLO</th><th>Difficulty</th><th>Bloom</th><th>Marks</th></tr></thead>
          <tbody>{shown.map((q) => (
            <tr key={q.id} data-q={q.id} style={{ opacity: q.complete ? 1 : 0.55 }}>
              <td><input type="checkbox" aria-label="Choose" disabled={locked || !q.complete} checked={ids.includes(q.id)} onChange={(e) => setIds(e.target.checked ? [...ids, q.id] : ids.filter((x) => x !== q.id))} /></td>
              <td style={{ whiteSpace: "pre-wrap", maxWidth: 460 }}>{q.text.slice(0, 300)}{q.mine && <span className="small-note"> (yours)</span>}{!q.complete && <span className="small-note" style={{ color: "#B76E00" }}> — metadata missing</span>}</td>
              <td>{q.lectureNumber !== null ? `W${q.week} L${q.lectureNumber}` : "—"}</td><td>{q.cloCodes.join(", ")}</td><td>{q.difficulty ? q.difficulty[0] + q.difficulty.slice(1).toLowerCase() : "—"}</td><td>{q.bloom}</td><td>{q.marks}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

/** 1–5 stars, a reason for 1–2. */
export function Stars({ team, examType, itemId, mine }: { team: string; examType: string; itemId: string; mine: { stars: number; comment: string | null } | null }) {
  const router = useRouter();
  const [s, setS] = useState(mine?.stars || 0);
  const [c, setC] = useState(mine?.comment || "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(stars: number) {
    setS(stars); setMsg(null);
    if (stars <= 2 && c.trim().length < 5) { setMsg({ ok: false, text: "Say what is wrong (1–2 stars need a reason), then click the stars again." }); return; }
    const r = await post({ action: "rate", team, exam: examType, itemId, stars, comment: c });
    setMsg(r.ok ? { ok: true, text: "Rated." } : { ok: false, text: r.data.error });
    if (r.ok) router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} data-stars={itemId}>
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => save(n)} style={{ background: "none", border: 0, cursor: "pointer", fontSize: 20, lineHeight: 1, color: n <= s ? "#C9A227" : "#bbb", padding: 2, minWidth: 28, minHeight: 28 }}>★</button>)}
      <input value={c} onChange={(e) => setC(e.target.value)} placeholder="comment (needed for 1–2 stars)" style={{ fontSize: 12, width: 220 }} aria-label="Rating comment" />
      {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
    </span>
  );
}

/** The Course Lead chooses a question for a slot (a reason is asked when overriding the highest rated). */
export function LeadPick({ team, examType, slot, options, current, top }: { team: string; examType: string; slot: string; options: { id: string; label: string }[]; current: string | null; top: string | null }) {
  const router = useRouter();
  const [id, setId] = useState(current || options[0]?.id || "");
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    let note = "";
    if (top && id !== top) { const n = prompt("Why are you overriding the highest-rated question?"); if (n === null) return; note = n; }
    const r = await post({ action: "lead", team, exam: examType, op: "pick", slot, itemId: id, note });
    setMsg(r.ok ? null : r.data.error);
    if (r.ok) router.refresh();
  }
  if (!options.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select value={id} onChange={(e) => setId(e.target.value)} style={{ maxWidth: 340, fontSize: 12 }} aria-label={`Question for ${slot}`}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      <button type="button" className="btn btn-secondary btn-sm" onClick={go}>Use</button>
      {msg && <span className="small-note" style={{ color: "var(--rust)" }}>{msg}</span>}
    </span>
  );
}
