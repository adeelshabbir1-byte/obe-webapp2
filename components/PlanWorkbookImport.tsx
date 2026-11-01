"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PartKey = "course" | "clos" | "lectures" | "assessments" | "items" | "questions";
const LABEL: Record<PartKey, string> = { course: "Course details", clos: "CLOs", lectures: "Lecture plan", assessments: "Assessment counts and weights", items: "Quiz and assignment topics", questions: "Mid and final questions" };
type Preview = { course: string; parts: PartKey[]; line: string; problems: Record<PartKey, string[]>; replaced: Partial<Record<PartKey, string>>; found: Partial<Record<PartKey, string>>; unmatched: { part: PartKey; sheet: string; missing: string[]; headings: string[] }[]; approved: boolean };
type Imp = { id: string; fileName: string; status: string; summary: string; createdAt: string; parts: string[] };
// Field keys of the columns a sheet needs (what the person points to when their heading differs).
const FIELD: Record<string, string> = { CLO: "code", Statement: "statement", Bloom: "bloom", Lecture: "lecture", Topic: "topic", Type: "type", Count: "count", "Weight %": "weight", "No.": "no", Exam: "exam", Q: "q", Marks: "marks" };

/** "Import from Excel" on a course plan: template, preview with problems, tick the parts, apply; undo later. */
export default function PlanWorkbookImport({ courseId, source }: { courseId: string; source: "SE" | "INSTRUCTOR" }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [pick, setPick] = useState<PartKey[]>([]);
  const [map, setMap] = useState<Record<string, { sheet?: string; columns?: Record<string, string> }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null);
  const [imps, setImps] = useState<Imp[]>([]);
  const loadImps = () => fetch(`/api/plan-import?courseId=${courseId}&source=${source}`).then((r) => r.json()).then((j) => setImps(j.imports || [])).catch(() => null);
  useEffect(() => { loadImps(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(action: string, extra: Record<string, string> = {}) {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("action", action); fd.set("courseId", courseId); fd.set("source", source); fd.set("mapping", JSON.stringify(map));
    if (file) fd.set("file", file);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    const r = await fetch("/api/plan-import", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    return { ok: r.ok, j };
  }
  async function preview() {
    const { ok, j } = await send("preview");
    if (!ok) { setMsg({ ok: false, text: j.error || "Failed." }); return; }
    setPv(j); setPick((j.parts as PartKey[]).filter((k) => !(j.problems[k] || []).length));
  }
  async function apply() {
    const { ok, j } = await send("apply", { parts: pick.join(",") });
    if (!ok) { setMsg({ ok: false, text: j.error || "Failed.", list: j.problems }); return; }
    setMsg({ ok: true, text: j.requested ? "The plan is approved, so this went to the OMC as a change request. Apply it here once they reopen the plan." : `Imported: ${j.line}. You can undo it below.` });
    setPv(null); setFile(null); loadImps(); router.refresh();
  }
  async function act(action: string, importId: string) {
    if (action === "undo" && !confirm("Undo this import? The plan goes back to how it was just before it.")) return;
    const { ok, j } = await send(action, { importId });
    setMsg(ok ? { ok: true, text: action === "undo" ? "Undone." : "Applied." } : { ok: false, text: j.error || "Failed." });
    loadImps(); router.refresh();
  }
  return (
    <details className="card no-print" data-plan-import>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Import from Excel (whole course plan)</summary>
      <p className="small-note" style={{ margin: "6px 0" }}>CLOs with Bloom and GA, the lecture plan, assessment counts, quiz and assignment topics, mid and final questions — from the <a href="/api/plan-import?template=1">blank template</a> or your own workbook (you point to differently named columns once). Nothing is saved until you choose.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setPv(null); }} aria-label="Excel workbook" data-plan-file />
        <button className="btn btn-sm" disabled={!file || busy} onClick={preview} data-plan-preview>{busy ? "Reading…" : "Preview"}</button>
      </div>
      {pv && (
        <div style={{ marginTop: 10, fontSize: 13 }} data-plan-preview-result>
          <b>{pv.line}</b>
          {pv.approved && <div style={{ color: "#8A3D0D" }}>This plan is approved by the OMC: importing raises a change request instead of overwriting it.</div>}
          {pv.unmatched.map((u) => (
            <div key={u.part} className="card" style={{ margin: "6px 0", padding: 8 }}>
              Sheet “{u.sheet}” ({LABEL[u.part]}): point to the columns for {u.missing.join(", ")}:
              {u.missing.map((m) => <label key={m} style={{ marginLeft: 8 }}>{m} <select onChange={(e) => setMap((x) => ({ ...x, [u.part]: { sheet: u.sheet, columns: { ...(x[u.part]?.columns || {}), [FIELD[m] || m.toLowerCase()]: e.target.value } } }))} defaultValue=""><option value="">—</option>{u.headings.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>)}
              <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={preview}>Use these (remembered for next time)</button>
            </div>
          ))}
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>
            {pv.parts.map((k) => { const probs = pv.problems[k] || []; return (
              <li key={k} style={{ padding: "4px 0", borderBottom: "1px solid #EEE" }}>
                <label><input type="checkbox" checked={pick.includes(k)} disabled={probs.length > 0} onChange={() => setPick(pick.includes(k) ? pick.filter((x) => x !== k) : pick.concat(k))} data-part={k} /> <b>{LABEL[k]}</b></label>
                {pv.replaced[k] && <span className="small-note"> — replaces {pv.replaced[k]}</span>}
                {probs.length > 0 && <ul className="err" style={{ margin: "4px 0 0 18px" }} data-part-problems={k}>{probs.slice(0, 12).map((p, i) => <li key={i}>{p}</li>)}</ul>}
              </li>); })}
          </ul>
          <button className="btn btn-sm" disabled={busy || !pick.length} onClick={apply} data-plan-apply>{pv.approved ? "Send as a change request" : `Import ${pick.length} part${pick.length === 1 ? "" : "s"}`}</button>
        </div>
      )}
      {msg && <div className={msg.ok ? "small-note" : "err"} style={{ marginTop: 6 }} data-plan-msg>{msg.text}{msg.list && <ul>{msg.list.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>}
      {imps.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5 }}><b>Imports</b>
        <ul style={{ margin: "4px 0 0 16px" }}>{imps.map((i) => <li key={i.id}>{new Date(i.createdAt).toLocaleString()} · {i.fileName} · {i.parts.join(", ")} · <i>{i.status.toLowerCase()}</i>{" "}
          {i.status === "APPLIED" && <button className="btn btn-secondary btn-sm" onClick={() => act("undo", i.id)} data-plan-undo>Undo</button>}
          {i.status === "PENDING" && <button className="btn btn-sm" onClick={() => act("applyPending", i.id)}>Apply now</button>}</li>)}</ul></div>}
    </details>
  );
}
