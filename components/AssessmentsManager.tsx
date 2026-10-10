"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import { effectiveSum, fmtPct, usableBestOf } from "../lib/assessmentWeights";
import SortableTable from "./SortableTable";
import Link from "next/link";

type Evidence = { id: string; fileName: string; fileUrl: string; status: string; method: string | null; reasoning: string | null };
type Instrument = { id: string; type: string; label: string; marksPct: number; maxScore: number; evidence: Evidence[] };
type Targets = { assignmentPct: number; quizPct: number; midtermPct: number; finalPct: number; projectPct: number; labPct: number };
type PolicyMax = { assignmentMax?: number; quizMax?: number; midtermMax?: number; finalMax?: number; projectMax?: number; labMax?: number };
type PolicyMinCount = { assignmentMinCount?: number; quizMinCount?: number; midtermMinCount?: number; finalMinCount?: number; projectMinCount?: number; labMinCount?: number };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; linkedInstrumentIds: string[]; midtermQuestions: string; finalQuestions: string; weightPct: number; cloId: string | null };

// A blank subtopic defaults to the topic itself — so "Introduction to
// Computing" taught across 2 lectures with no subtopic typed in still
// groups as one thing below, instead of the grouping silently falling
// apart because half the rows have a subtopic and half don't.
function effectiveSubtopic(r: { topic: string; subtopic: string | null }) {
  return (r.subtopic && r.subtopic.trim()) || r.topic;
}
type Clo = { id: string; code: string };

const TYPES = ["Quiz", "Assignment", "Midterm", "Final", "Project", "Lab"];
const TARGET_KEY: Record<string, keyof Targets> = {
  Quiz: "quizPct", Assignment: "assignmentPct", Midterm: "midtermPct", Final: "finalPct", Project: "projectPct", Lab: "labPct",
};
const POLICY_MAX_KEY: Record<string, keyof PolicyMax> = {
  Quiz: "quizMax", Assignment: "assignmentMax", Midterm: "midtermMax", Final: "finalMax", Project: "projectMax", Lab: "labMax",
};
const POLICY_MIN_COUNT_KEY: Record<string, keyof PolicyMinCount> = {
  Quiz: "quizMinCount", Assignment: "assignmentMinCount", Midterm: "midtermMinCount", Final: "finalMinCount", Project: "projectMinCount", Lab: "labMinCount",
};

// Column headers read top-to-bottom instead of left-to-right, so a
// course with many quizzes/assignments/CLOs stays a reasonable width
// instead of stretching the table wider with every one added — only
// used on the columns that actually multiply (instruments, CLOs); the
// fixed ones (Topic, Weight, Q#) stay normal horizontal headers.
const verticalHeaderStyle = {
  textAlign: "center", fontSize: 11, padding: "6px 2px", verticalAlign: "bottom",
} as const;
const verticalTextStyle = {
  display: "inline-block", writingMode: "vertical-rl", transform: "rotate(180deg)",
  whiteSpace: "nowrap", maxHeight: 140,
} as const;

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; label: string }> = {
    PENDING: { bg: "#eee", label: "Checking…" },
    VALIDATED: { bg: "#B8E6B8", label: "Validated" },
    FLAGGED: { bg: "#F5D0A9", label: "Needs review" },
    ERROR: { bg: "#F5B8B8", label: "Error" },
  };
  const s = styles[status] || styles.PENDING;
  return <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: s.bg }}>{s.label}</span>;
}

// Every action here updates local state directly from its own
// response, instead of router.refresh() re-fetching this course's
// full instrument list, lecture rows, and evidence on every single
// edit, upload, or checkbox toggle.
export default function AssessmentsManager({ courseId, initialInstruments, targets, policyMax, policyMinCount, rows: initialRows, clos, apiBase, bestOf }: {
  courseId: string; initialInstruments: Instrument[]; targets: Targets; policyMax?: PolicyMax; policyMinCount?: PolicyMinCount; rows: Row[]; clos?: Clo[]; apiBase: string; bestOf?: Record<string, number | null>;
}) {
  const [instruments, setInstruments] = useState<Instrument[]>(initialInstruments);
  // "rows" is the working copy the checkboxes/question-number boxes edit
  // locally, with no network call per click — a course with many lecture
  // rows × many quizzes was firing one PUT request per single tick, which
  // is what made ticking boxes feel slow. "savedRows" is what the server
  // actually has; the two only get reconciled when Save is pressed.
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [savedRows, setSavedRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);

  async function uploadEvidence(instrumentId: string, file: File) {
    setUploadingId(instrumentId); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/courses/${courseId}/instruments/${instrumentId}/evidence`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setUploadingId(null); return; }
      setInstruments((prev) => prev.map((i) => i.id === instrumentId ? { ...i, evidence: [data.evidence, ...i.evidence] } : i));
      setUploadingId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setUploadingId(null); }
  }

  async function addInstrument(type: string, nextLabel: string, marksPct: string, maxScore: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/instruments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, label: nextLabel, marksPct, maxScore }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setInstruments((prev) => [...prev, { ...data.instrument, evidence: [] }]);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  // Label/Marks%/Out-Of edits are kept local (updating "instruments" so the
  // per-category totals above update live) and only sent to the server in
  // one batch when "Save Instrument Changes" is pressed (or Ctrl+S) —
  // typing through several quizzes' marks one after another used to fire a
  // separate save (and a full content-sync) per field blur, which is what
  // made it feel slow.
  const [dirtyInstrumentIds, setDirtyInstrumentIds] = useState<Set<string>>(new Set());
  const pendingEditsRef = useRef<Record<string, { marksPct?: number; maxScore?: number; label?: string }>>({});

  function editInstrumentLocal(id: string, patch: { marksPct?: number; maxScore?: number; label?: string }) {
    setInstruments((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i));
    pendingEditsRef.current[id] = { ...pendingEditsRef.current[id], ...patch };
    setDirtyInstrumentIds((prev) => new Set(prev).add(id));
  }

  async function saveInstrumentChanges() {
    const edits = Object.keys(pendingEditsRef.current).map((instrumentId) => ({ instrumentId, ...pendingEditsRef.current[instrumentId] }));
    if (edits.length === 0) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/instruments/batch-save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      setInstruments(data.instruments);
      pendingEditsRef.current = {};
      setDirtyInstrumentIds(new Set());
      setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  async function removeInstrument(id: string) {
    setLoading(true);
    await fetch(`${apiBase}/courses/${courseId}/instruments/${id}`, { method: "DELETE" });
    setInstruments((prev) => prev.filter((i) => i.id !== id));
    setLoading(false);
  }

  // Creates however many rows are still missing to reach the OMC's
  // required minimum count for this type, splitting that type's target
  // % evenly across ALL of them (existing + new) so the numbers land
  // close to right without SE having to do the math — still fully
  // editable afterward, same as any instrument row.
  async function fillToMinimum(type: string, minCount: number) {
    const existing = instruments.filter((i) => i.type === type);
    const missing = minCount - existing.length;
    if (missing <= 0) return;
    setLoading(true); setError("");
    const isNumbered = type === "Midterm" || type === "Final";
    const target = targets[TARGET_KEY[type]] || 0;
    const kBest = usableBestOf(bestOf?.[type], minCount);
    const perItem = Math.round((target / (kBest || minCount)) * 10000) / 10000 || 0;
    try {
      for (let n = existing.length + 1; n <= minCount; n++) {
        const label = isNumbered ? String(n) : `${type} ${n}`;
        const res = await fetch(`${apiBase}/courses/${courseId}/instruments`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, label, marksPct: perItem, maxScore: "10" }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Something went wrong."); break; }
        setInstruments((prev) => [...prev, { ...data.instrument, evidence: [] }]);
      }
    } catch (err: any) { setError("Unexpected error: " + err.message); }
    setLoading(false);
  }

  // These three just update the local working copy — nothing is sent to
  // the server until "Save Mapping Changes" is pressed below. The grid
  // groups lecture rows that share the same (effective) subtopic into one
  // line, so a toggle or a typed Q# here applies to every real lecture row
  // in that group at once — ticking "Introduction to Computing — 2 lec"
  // links the instrument to BOTH underlying lectures, not just one, so the
  // weight split and the "linked to a quiz/exam" progress check come out
  // right for every row that topic actually spans.
  function toggleInstrumentLocal(rowIds: string[], instrumentId: string, linked: boolean) {
    const idSet = new Set(rowIds);
    setRows((prev) => prev.map((r) => idSet.has(r.id)
      ? { ...r, linkedInstrumentIds: linked ? [...r.linkedInstrumentIds, instrumentId] : r.linkedInstrumentIds.filter((id) => id !== instrumentId) }
      : r));
  }

  function setQuestionsLocal(rowIds: string[], type: "Midterm" | "Final", value: string) {
    const idSet = new Set(rowIds);
    setRows((prev) => prev.map((r) => idSet.has(r.id)
      ? { ...r, [type === "Midterm" ? "midtermQuestions" : "finalQuestions"]: value }
      : r));
  }

  const mappingDirty = rows.some((r) => {
    const saved = savedRows.find((s) => s.id === r.id);
    if (!saved) return false;
    return JSON.stringify([...r.linkedInstrumentIds].sort()) !== JSON.stringify([...saved.linkedInstrumentIds].sort())
      || r.midtermQuestions !== saved.midtermQuestions || r.finalQuestions !== saved.finalQuestions;
  });

  // Warn before leaving the page with unsaved mapping OR instrument-field
  // changes, since both now only live in local state until their Save
  // button (or Ctrl+S) is used. Refs keep the beforeunload handler
  // (registered once) seeing the LATEST dirty flags rather than whatever
  // they were when the effect first ran.
  const mappingDirtyRef = useRef(mappingDirty);
  mappingDirtyRef.current = mappingDirty;
  const instrumentsDirtyRef = useRef(false);
  instrumentsDirtyRef.current = dirtyInstrumentIds.size > 0;
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) { if (mappingDirtyRef.current || instrumentsDirtyRef.current) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // One request carrying every change in the batch, rather than one
  // request per tick/edit — each individual save used to also trigger a
  // full re-sync of this course's content out to every linked batch in
  // its Content Sync group, so firing many of those in parallel (one
  // per checkbox) was both slow and, since they could race each other,
  // the likely cause of weights coming out wrong. The backend now
  // applies the whole batch, recomputes weight once, and syncs once.
  async function saveMappingChanges() {
    setSaving(true); setError("");
    try {
      const toggles: { lectureRowId: string; instrumentId: string; linked: boolean }[] = [];
      const questions: { lectureRowId: string; type: "Midterm" | "Final"; numbers: string }[] = [];
      for (const r of rows) {
        const saved = savedRows.find((s) => s.id === r.id);
        if (!saved) continue;
        const added = r.linkedInstrumentIds.filter((id) => !saved.linkedInstrumentIds.includes(id));
        const removed = saved.linkedInstrumentIds.filter((id) => !r.linkedInstrumentIds.includes(id));
        for (const instrumentId of added) toggles.push({ lectureRowId: r.id, instrumentId, linked: true });
        for (const instrumentId of removed) toggles.push({ lectureRowId: r.id, instrumentId, linked: false });
        if (r.midtermQuestions !== saved.midtermQuestions) questions.push({ lectureRowId: r.id, type: "Midterm", numbers: r.midtermQuestions });
        if (r.finalQuestions !== saved.finalQuestions) questions.push({ lectureRowId: r.id, type: "Final", numbers: r.finalQuestions });
      }
      if (toggles.length === 0 && questions.length === 0) { setSaving(false); return; }

      const res = await fetch(`${apiBase}/courses/${courseId}/lecture-mapping/save`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toggles, questions }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }

      const byId: Map<string, any> = new Map((data.rows || []).map((rr: any) => [rr.id, rr]));
      const reconciled = rows.map((r) => byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r);
      setRows(reconciled);
      setSavedRows(reconciled);
      setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  const checkboxInstruments = instruments.filter((i) => i.type === "Quiz" || i.type === "Assignment");
  const hasMidterm = instruments.some((i) => i.type === "Midterm");
  const hasFinal = instruments.some((i) => i.type === "Final");
  const filledRows = rows.filter((r) => r.topic.trim().length > 0);

  // Per-CLO weight matrix (same shape as the "CLO Assessment Matrix"
  // sheet in the original Excel template): one column per CLO, showing
  // each topic's Weight under its OWN CLO's column and blank under every
  // other — a topic maps to exactly one CLO here — plus a Total row
  // summing each CLO's column across every topic, and a grand total.
  const cloList = clos || [];
  const cloTotals = cloList.map((c) => filledRows.filter((r) => r.cloId === c.id).reduce((s, r) => s + r.weightPct, 0));
  const grandTotal = cloTotals.reduce((s, t) => s + t, 0);

  // CLOs should each carry roughly the same share of the total marks — one
  // CLO barely tested while another dominates the paper is a red flag for
  // OMC review. A small spread is normal (marks don't divide perfectly
  // evenly across CLOs); only flag it once the spread gets large.
  const CLO_BALANCE_TOLERANCE = 7;
  const cloSpread = cloTotals.length > 1 ? Math.max(...cloTotals) - Math.min(...cloTotals) : 0;
  const cloImbalanced = cloTotals.length > 1 && cloSpread > CLO_BALANCE_TOLERANCE;

  // The mapping grid below groups lecture rows by their (effective)
  // subtopic — if the same subtopic was taught across several lectures,
  // it shows once, with a lecture count, instead of once per lecture. A
  // row's own CLO/checkbox/Q# state is assumed consistent across every
  // lecture in its group (Save always writes it that way), so the first
  // row's values represent the whole group for display purposes.
  type Group = { key: string; rows: Row[] };
  const groups: Group[] = [];
  const groupByKey = new Map<string, Group>();
  for (const r of filledRows) {
    const key = effectiveSubtopic(r);
    let g = groupByKey.get(key);
    if (!g) { g = { key, rows: [] }; groupByKey.set(key, g); groups.push(g); }
    g.rows.push(r);
  }
  for (const g of groups) g.rows.sort((a, b) => a.lectureNumber - b.lectureNumber);

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: -4 }}>
        {dirtyInstrumentIds.size > 0 && <span style={{ fontSize: 11.5, color: "var(--brass-dark)" }}>Unsaved changes to {dirtyInstrumentIds.size} item(s) below</span>}
        <button onClick={saveInstrumentChanges} disabled={dirtyInstrumentIds.size === 0 || saving} data-save-shortcut="true" className="btn btn-brass">
          {saving ? "Saving…" : "Save Instrument Changes"}
        </button>
      </div>

      {TYPES.map((type) => {
        const items = instruments.filter((i) => i.type === type);
        const kBest = usableBestOf(bestOf?.[type], items.length);
        const sum = Math.round(effectiveSum(items.map((i) => i.marksPct), bestOf?.[type]) * 100) / 100;
        const target = targets[TARGET_KEY[type]];
        const max = policyMax?.[POLICY_MAX_KEY[type]];
        const overTarget = items.length > 0 && Math.abs(sum - (target || 0)) > 0.02;
        const overPolicy = items.length > 0 && max !== undefined && sum > max;
        const isNumbered = type === "Midterm" || type === "Final";
        const nextLabel = isNumbered ? String(items.length + 1) : `${type} ${items.length + 1}`;
        const minCount = policyMinCount?.[POLICY_MIN_COUNT_KEY[type]] || 0;
        const underMinCount = minCount > 0 && items.length < minCount;
        return (
          <div className="card" key={type}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14 }}>{type}</h3>
              <span style={{ fontSize: 11.5, color: overPolicy ? "var(--rust)" : overTarget ? "var(--brass-dark)" : "var(--slate)" }}>
                {fmtPct(sum)}% defined {kBest ? `(best ${kBest} of ${items.length} count, each worth ${fmtPct(items[0] ? items[0].marksPct : 0)}%) ` : ""}{target ? `(your target: ${target}%${max !== undefined ? `, OMC max: ${max}%` : ""})` : ""}
                {minCount > 0 ? ` — OMC minimum: ${minCount} ${isNumbered ? "question(s)" : ""}` : ""}
              </span>
            </div>
            {underMinCount && (
              <p style={{ fontSize: 11.5, color: "var(--rust)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span>⚠ OMC requires at least {minCount} {isNumbered ? "question(s)" : `${type.toLowerCase()}(s)`} — you have {items.length}.</span>
                <button onClick={() => fillToMinimum(type, minCount)} disabled={loading} className="btn btn-brass" style={{ fontSize: 11.5, padding: "3px 10px" }}>
                  {loading ? "Adding…" : `Add ${minCount - items.length} to Reach Minimum`}
                </button>
              </p>
            )}
            {overPolicy && (
              <p style={{ fontSize: 11.5, color: "var(--rust)", marginBottom: 8, fontWeight: 600 }}>
                ⚠ Exceeds the OMC's policy maximum of {max}% for this course type.
              </p>
            )}
            {!overPolicy && overTarget && (
              <p style={{ fontSize: 11.5, color: "var(--brass-dark)", marginBottom: 8 }}>
                ⚠ Doesn't match your own {target}% target for this category yet.
              </p>
            )}
            <SortableTable>
              <thead><tr><th>{isNumbered ? "Question #" : "Label"}</th><th>Marks %</th><th>Out of (raw)</th><th>Evidence</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>None defined yet.</td></tr>}
                {items.map((i) => (
                  <Fragment key={i.id}>
                  <tr>
                    <td>
                      {isNumbered ? `Q${i.label}` : (
                        <input
                          type="text" defaultValue={i.label}
                          onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== i.label) editInstrumentLocal(i.id, { label: e.target.value.trim() }); }}
                          style={{ width: 90, padding: "4px 6px", border: dirtyInstrumentIds.has(i.id) ? "1px solid var(--brass)" : "1px solid var(--line)", fontSize: 12.5 }}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        type="number" step="any" min={0} max={100} defaultValue={fmtPct(i.marksPct)} readOnly={!!kBest} disabled={!!kBest} title={kBest ? `Best ${kBest} of ${items.length} count, so every ${type.toLowerCase()} carries the same weight. You can still change what it is marked out of.` : undefined}
                        onBlur={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n) && Math.abs(n - i.marksPct) > 0.0001) editInstrumentLocal(i.id, { marksPct: n }); }}
                        style={{ width: 60, padding: "4px 6px", border: dirtyInstrumentIds.has(i.id) ? "1px solid var(--brass)" : "1px solid var(--line)", fontSize: 12.5 }}
                      />%
                    </td>
                    <td>
                      / <input
                        type="number" min={1} defaultValue={i.maxScore}
                        onBlur={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1 && n !== i.maxScore) editInstrumentLocal(i.id, { maxScore: n }); }}
                        style={{ width: 60, padding: "4px 6px", border: dirtyInstrumentIds.has(i.id) ? "1px solid var(--brass)" : "1px solid var(--line)", fontSize: 12.5 }}
                      />
                    </td>
                    <td>
                      {i.evidence.length === 0 ? (
                        <span style={{ fontSize: 11, color: "var(--slate)" }}>None</span>
                      ) : (
                        <button onClick={() => setExpandedEvidenceId(expandedEvidenceId === i.id ? null : i.id)} style={{ fontSize: 11, background: "none", border: "1px solid var(--line)", padding: "2px 6px", cursor: "pointer" }}>
                          {i.evidence.length} {statusBadge(i.evidence[0].status)}
                        </button>
                      )}
                      <label style={{ fontSize: 10.5, color: "var(--brass-dark)", textDecoration: "underline", cursor: uploadingId === i.id ? "default" : "pointer", display: "block", marginTop: 3 }}>
                        {uploadingId === i.id ? "Uploading…" : "+ Attach"}
                        <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} disabled={uploadingId === i.id}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(i.id, f); e.target.value = ""; }} />
                      </label>
                    </td>
                    <td><button onClick={() => removeInstrument(i.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                  </tr>
                  {expandedEvidenceId === i.id && i.evidence.length > 0 && (
                    <tr>
                      <td colSpan={5} style={{ background: "#FAFAF8", padding: 10 }}>
                        {i.evidence.map((e) => (
                          <div key={e.id} style={{ fontSize: 11.5, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Link href={e.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brass-dark)" }}>{e.fileName}</Link>
                              {statusBadge(e.status)}
                            </div>
                            {e.reasoning && <div style={{ color: "var(--slate)", fontSize: 10.5, marginTop: 2 }}>{e.method === "AI" ? "AI: " : "Note: "}{e.reasoning}</div>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </SortableTable>
            <AddRow type={type} nextLabel={nextLabel} loading={loading} onAdd={addInstrument} />
          </div>
        );
      })}

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 14 }}>Which Topic Does Each Instrument Test?</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {mappingDirty && <span style={{ fontSize: 11.5, color: "var(--brass-dark)" }}>Unsaved changes</span>}
            <button onClick={saveMappingChanges} disabled={!mappingDirty || saving} data-save-shortcut="true" className="btn btn-brass">{saving ? "Saving…" : "Save Mapping Changes"}</button>
          </div>
        </div>
        {cloImbalanced && (
          <p style={{ fontSize: 11.5, color: "var(--rust)", marginBottom: 10, fontWeight: 600 }}>
            ⚠ CLOs are not equally distributed — {fmtPct(cloSpread)}% spread between the highest and lowest CLO total
            (a {CLO_BALANCE_TOLERANCE}% spread is the most that's normally allowed). Consider mapping more topics to the
            under-weighted CLO(s) so each CLO carries a similar share of the marks.
          </p>
        )}
        {filledRows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Fill in some lecture topics on the Lecture Content tab first.</p>
        ) : instruments.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Define at least one instrument above first.</p>
        ) : (
          <SortableTable>
            <thead>
              <tr>
                <th style={{ verticalAlign: "bottom" }}>Sr#</th>
                <th style={{ verticalAlign: "bottom" }}>Topic</th>
                {checkboxInstruments.map((i) => (
                  <th key={i.id} style={verticalHeaderStyle} title={`${i.type} ${i.label}`}><span style={verticalTextStyle}>{i.type} {i.label}</span></th>
                ))}
                {hasMidterm && <th style={verticalHeaderStyle} title="Midterm Q#"><span style={verticalTextStyle}>Midterm Q#</span></th>}
                {hasFinal && <th style={verticalHeaderStyle} title="Final Q#"><span style={verticalTextStyle}>Final Q#</span></th>}
                <th style={{ verticalAlign: "bottom" }}>Weight</th>
                {cloList.map((c) => <th key={c.id} style={verticalHeaderStyle} title={c.code}><span style={verticalTextStyle}>{c.code}</span></th>)}
              </tr>
              {(cloList.length > 0 || hasMidterm || hasFinal) && (
                // <td> (not <th>) deliberately — SortableTable binds
                // click-to-sort to every <th> inside <thead>, and this
                // is a summary row, not another set of column headers;
                // using <th> here would double up the header count and
                // throw off the column index the real sort logic uses.
                <tr style={{ background: "#FAFAF8", fontWeight: 600 }}>
                  <td></td>
                  <td style={{ fontSize: 12 }}>Total</td>
                  {checkboxInstruments.map((i) => <td key={i.id}></td>)}
                  {hasMidterm && <td style={{ fontSize: 10, fontWeight: 400, color: "var(--slate)", fontStyle: "italic" }}>e.g. 1,3</td>}
                  {hasFinal && <td style={{ fontSize: 10, fontWeight: 400, color: "var(--slate)", fontStyle: "italic" }}>e.g. 2</td>}
                  <td style={{ fontSize: 12 }}>{fmtPct(grandTotal)}%</td>
                  {cloTotals.map((t, idx) => <td key={cloList[idx].id} style={{ textAlign: "center", fontSize: 12 }}>{fmtPct(t)}%</td>)}
                </tr>
              )}
            </thead>
            <tbody>
              {groups.map((g, idx) => {
                const rowIds = g.rows.map((r) => r.id);
                const first = g.rows[0];
                const lectureLabel = g.rows.length === 1
                  ? `Wk${first.week}·L${first.lectureNumber}`
                  : `L${g.rows.map((r) => r.lectureNumber).join(",")}`;
                const groupWeight = g.rows.reduce((s, r) => s + r.weightPct, 0);
                return (
                <tr key={g.key}>
                  <td style={{ fontSize: 12, color: "var(--slate)" }}>{idx + 1}</td>
                  <td style={{ fontSize: 12 }}>
                    {lectureLabel} — {g.key}
                    {g.rows.length > 1 && <span style={{ color: "var(--slate)" }}> ({g.rows.length} lec)</span>}
                  </td>
                  {checkboxInstruments.map((i) => {
                    const checked = g.rows.every((r) => r.linkedInstrumentIds.includes(i.id));
                    return <td key={i.id} style={{ textAlign: "center" }}><input type="checkbox" checked={checked} disabled={saving} onChange={(e) => toggleInstrumentLocal(rowIds, i.id, e.target.checked)} /></td>;
                  })}
                  {hasMidterm && (
                    <td style={{ background: first.midtermQuestions.trim() ? "#FFF3D6" : undefined }}>
                      <input value={first.midtermQuestions} disabled={saving}
                        onChange={(e) => setQuestionsLocal(rowIds, "Midterm", e.target.value)}
                        style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12, background: first.midtermQuestions.trim() ? "#FFF3D6" : undefined }} />
                    </td>
                  )}
                  {hasFinal && (
                    <td style={{ background: first.finalQuestions.trim() ? "#FFF3D6" : undefined }}>
                      <input value={first.finalQuestions} disabled={saving}
                        onChange={(e) => setQuestionsLocal(rowIds, "Final", e.target.value)}
                        style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12, background: first.finalQuestions.trim() ? "#FFF3D6" : undefined }} />
                    </td>
                  )}
                  <td style={{ fontWeight: 600 }}>{fmtPct(groupWeight)}%</td>
                  {cloList.map((c) => {
                    const t = g.rows.filter((r) => r.cloId === c.id).reduce((s, r) => s + r.weightPct, 0);
                    return <td key={c.id} style={{ textAlign: "center", fontSize: 12 }}>{t > 0 ? `${fmtPct(t)}%` : ""}</td>;
                  })}
                </tr>
                );
              })}
            </tbody>
          </SortableTable>
        )}
        {filledRows.length > 0 && instruments.length > 0 && cloList.length === 0 && (
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>
            Per-CLO weight columns will appear here once topics are mapped to a CLO on the Lecture Content tab.
          </p>
        )}
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          Rows here are grouped by subtopic — if the same subtopic was taught across several lectures, it's shown
          once with the lecture count in brackets, and ticking or typing a question number for it applies to every
          lecture in that group at once. If a quiz, assignment, or question is linked to more than one lecture, its
          marks are split evenly across them. Ticking boxes and typing question numbers here only changes this
          screen — nothing is saved (and the Weight column won't update) until you click "Save Mapping Changes" above.
          A Midterm/Final Q# box is shaded once a question number is entered in it, so filled-in cells are easy to
          spot at a glance. Click a column header to sort by it — click again to reverse, and a third click returns
          the table to its original week/lecture order. The "Sr#" column always keeps each row's original position —
          click its header once to jump straight back to that order after sorting by anything else.
        </p>
      </div>
    </>
  );
}

function AddRow({ type, nextLabel, loading, onAdd }: { type: string; nextLabel: string; loading: boolean; onAdd: (type: string, label: string, marksPct: string, maxScore: string) => void }) {
  const [marksPct, setMarksPct] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const isNumbered = type === "Midterm" || type === "Final";
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!marksPct) return;
    onAdd(type, nextLabel, marksPct, maxScore || "10");
    setMarksPct("");
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--slate)" }}>Next: <b style={{ color: "var(--ink)" }}>{isNumbered ? `Q${nextLabel}` : nextLabel}</b></div>
      <div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Marks %</label>
        <input value={marksPct} onChange={(e) => setMarksPct(e.target.value)} type="number" min={0} max={100} required style={{ padding: "6px 8px", border: "1px solid var(--line)", width: 70 }} />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Out of (raw)</label>
        <input value={maxScore} onChange={(e) => setMaxScore(e.target.value)} type="number" min={1} style={{ padding: "6px 8px", border: "1px solid var(--line)", width: 70 }} />
      </div>
      <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>Add</button>
    </form>
  );
}
