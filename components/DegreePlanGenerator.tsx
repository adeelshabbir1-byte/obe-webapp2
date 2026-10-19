"use client";

import { useEffect, useState } from "react";

type FormTerm = { key: string; label: string; summer: boolean; studentSem: number | null; limit: number; typed: number | null };
type Placed = { courseId: string; code: string; title: string; credits: number; batch: string; own: boolean; projected: boolean; retake: boolean; ahead: boolean; summer: boolean };
type Plan = { terms: { key: string; label: string; summer: boolean; studentSem: number | null; cap: number; credits: number; courses: Placed[] }[]; unplaced: { code: string; title: string; why: string }[]; finishLabel: string | null; expectedLabel: string; lateTerms: number; balanced: boolean };
type Req = { id: string; kind: string; courseCode: string | null; term: string | null; status: string; by: string; decidedBy: string | null; note: string | null; decisionNote: string | null; at: string };
type Data = {
  editedBy: "student" | "staff"; locked: boolean; student: { name: string; cgpa: number | null; lowCgpa: boolean };
  policy: { summer: number; lowCgpa: number; normal: number; threshold: number };
  form: FormTerm[]; plan: Plan; curriculumNotes: string[]; courses: { code: string; title: string; sem: number }[]; requests: Req[];
};

const tag = (t: string, bg: string, fg: string, title?: string) => <span title={title} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: bg, color: fg, marginLeft: 5, whiteSpace: "nowrap" }}>{t}</span>;

/** "Plan the rest of the degree": type the most credit hours for each coming term (summers too), see the plan, apply it. */
export default function DegreePlanGenerator({ studentId, onApplied }: { studentId?: string; onApplied?: () => void }) {
  const q = studentId ? `?studentId=${studentId}` : "";
  const [data, setData] = useState<Data | null>(null);
  const [loads, setLoads] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [rq, setRq] = useState({ kind: "SUMMER_LOAD", courseCode: "", termKey: "", note: "" });

  async function load() {
    const r = await fetch(`/api/degree-planner${q}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || "Could not load the planner."); return; }
    setData(d);
    setLoads(Object.fromEntries((d as Data).form.map((t) => [t.key, t.typed === null ? "" : String(t.typed)])));
  }
  useEffect(() => { if (open && !data) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/degree-planner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Could not save.");
    return d;
  }
  async function preview() { setBusy("preview"); setMsg(""); try { await post({ action: "loads", loads }); await load(); } catch (e) { setMsg((e as Error).message); } setBusy(""); }
  async function apply() {
    if (!confirm("Put every course into the term shown here? Courses already planned elsewhere move to these terms.")) return;
    setBusy("apply"); setMsg("");
    try { const d = await post({ action: "apply", loads }); setMsg(`Plan applied: ${d.placed} course(s), finishing ${d.finish || "—"}.`); onApplied?.(); await load(); } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }
  async function request() {
    setBusy("request"); setMsg("");
    try { await post({ action: "request", ...rq }); setMsg("Request sent."); setRq({ ...rq, note: "" }); await load(); } catch (e) { setMsg((e as Error).message); }
    setBusy("");
  }

  const summers = data?.form.filter((t) => t.summer) || [];
  return (
    <details className="card" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 12 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Plan the rest of the degree <span className="small-note" style={{ fontWeight: 400 }}>— type the load for each term and let the system lay out every remaining course</span></summary>
      {!data ? <p className="small-note">{msg || "Loading…"}</p> : (
        <div style={{ marginTop: 10 }}>
          <p className="small-note" style={{ marginTop: 0 }}>
            Later batches are assumed to follow today&apos;s curriculum. Each course goes with your own batch where possible, otherwise the batch that teaches it that term.
            Prerequisites come first. No course comes before its own semester unless approved. Summer is only for courses already taken (new ones need the Dean),
            up to {data.policy.summer} credit hours (12 with the Program Lead&apos;s approval).
            {data.student.lowCgpa ? ` CGPA is below ${data.policy.threshold.toFixed(2)}, so regular terms are limited to ${data.policy.lowCgpa} credit hours.` : ""}
            {" "}Leave a box empty to use its limit (summers: not used).
          </p>
          {data.curriculumNotes.length > 0 && <div className="err" style={{ background: "#FFF8EC", color: "#7A5208" }}><b>Today&apos;s curriculum differs from this student&apos;s:</b> {data.curriculumNotes.join("; ")}.</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {data.form.map((t) => (
              <label key={t.key} style={{ fontSize: 11.5, border: "1px solid var(--line)", padding: "4px 6px", background: t.summer ? "#FFF8EC" : undefined, minWidth: 92 }}>
                <div><b>{t.label}</b>{t.studentSem ? <span className="small-note"> · S{t.studentSem}</span> : null}</div>
                <input type="number" min={0} max={t.limit} value={loads[t.key] ?? ""} placeholder={t.summer ? `0 (max ${t.limit})` : `${t.limit}`} onChange={(e) => setLoads({ ...loads, [t.key]: e.target.value })} style={{ width: 70 }} aria-label={`Load ${t.label}`} disabled={data.editedBy === "student" && data.locked} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={preview}>{busy === "preview" ? "Working…" : "Save loads & show plan"}</button>
            {!(data.editedBy === "student" && data.locked) && <button type="button" className="btn btn-brass btn-sm" disabled={!!busy} onClick={apply}>{busy === "apply" ? "Applying…" : "Apply this plan"}</button>}
            {msg && <span className="small-note" style={{ alignSelf: "center" }}>{msg}</span>}
          </div>

          <div style={{ fontSize: 13.5, margin: "6px 0" }}>
            {data.plan.finishLabel ? <>Finishes <b>{data.plan.finishLabel}</b> — {data.plan.lateTerms ? <b style={{ color: "#c93c3c" }}>{data.plan.lateTerms} term{data.plan.lateTerms > 1 ? "s" : ""} after the batch ({data.plan.expectedLabel})</b> : <b style={{ color: "#23894f" }}>with the batch ({data.plan.expectedLabel})</b>}</> : "Nothing left to plan."}
            {data.plan.balanced && <span className="small-note"> · the last terms were evened out instead of leaving a light final term</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {data.plan.terms.filter((t) => t.courses.length || !t.summer).map((t) => (
              <div key={t.key} style={{ border: "1px solid var(--line)", padding: "8px 10px", background: t.summer ? "#FFF8EC" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><b>{t.label}{t.studentSem ? ` · Semester ${t.studentSem}` : ""}</b><span className="small-note">{t.credits}/{t.cap} CH</span></div>
                {t.courses.length === 0 ? <div className="small-note">—</div> : t.courses.map((c) => (
                  <div key={c.courseId} style={{ fontSize: 12.5, marginTop: 3 }}>
                    <b>{c.code}</b> {c.title} <span className="small-note">({c.credits})</span>
                    <div className="small-note" style={{ marginLeft: 8 }}>
                      {c.own ? "with own batch" : `with ${c.batch}`}
                      {c.retake && tag("repeat", "#FBEAEA", "#B3261E")}
                      {c.ahead && tag("ahead — approved", "#EEF2FA", "#1B4F8A")}
                      {c.projected && tag("expected batch", "#F1F1EE", "var(--slate)", "A batch that hasn't been admitted yet, assumed to follow today's curriculum")}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {data.plan.unplaced.length > 0 && <div className="err" style={{ marginTop: 10 }}><b>Could not be placed:</b> {data.plan.unplaced.map((u) => `${u.code} ${u.title} — ${u.why}`).join("; ")}</div>}

          {(data.editedBy === "staff" || data.requests.length > 0) && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 10 }}>
              <b style={{ fontSize: 13 }}>Exceptions</b>
              {data.editedBy === "staff" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "6px 0" }}>
                  <select value={rq.kind} onChange={(e) => setRq({ ...rq, kind: e.target.value })}>
                    <option value="SUMMER_LOAD">12 credit hours in a summer (Program Lead)</option>
                    <option value="AHEAD">A course before its semester (HOD / Chairman / Dean)</option>
                    <option value="SUMMER_NEW">A new course in summer (Dean)</option>
                  </select>
                  {rq.kind !== "SUMMER_LOAD" && <select value={rq.courseCode} onChange={(e) => setRq({ ...rq, courseCode: e.target.value })}><option value="">— course —</option>{data.courses.map((c) => <option key={c.code} value={c.code}>{c.code} {c.title} (S{c.sem})</option>)}</select>}
                  {rq.kind !== "AHEAD" && <select value={rq.termKey} onChange={(e) => setRq({ ...rq, termKey: e.target.value })}><option value="">— summer —</option>{summers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>}
                  <input type="text" placeholder="Reason" value={rq.note} onChange={(e) => setRq({ ...rq, note: e.target.value })} style={{ minWidth: 200 }} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={request}>Send request</button>
                </div>
              )}
              {data.requests.length > 0 && (
                <table style={{ fontSize: 12, marginTop: 4 }}>
                  <tbody>{data.requests.map((r) => <tr key={r.id}><td>{r.kind}{r.courseCode ? ` — ${r.courseCode}` : ""}{r.term ? ` · ${r.term}` : ""}</td><td className="small-note">by {r.by}</td><td style={{ fontWeight: 600, color: r.status === "APPROVED" ? "#23894f" : r.status === "REJECTED" ? "#c93c3c" : "#c98a0b" }}>{r.status.toLowerCase()}{r.decidedBy ? ` by ${r.decidedBy}` : ""}</td><td className="small-note">{r.decisionNote || r.note || ""}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </details>
  );
}
