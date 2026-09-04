"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Instrument = { id: string; type: string; label: string; marksPct: number };
type Targets = { assignmentPct: number; quizPct: number; midtermPct: number; finalPct: number; projectPct: number; labPct: number };
type PolicyMax = { assignmentMax?: number; quizMax?: number; midtermMax?: number; finalMax?: number; projectMax?: number; labMax?: number };
type Row = { id: string; week: number; lectureNumber: number; topic: string; linkedInstrumentIds: string[]; midtermQuestions: string; finalQuestions: string; weightPct: number };

const TYPES = ["Quiz", "Assignment", "Midterm", "Final", "Project", "Lab"];
const TARGET_KEY: Record<string, keyof Targets> = {
  Quiz: "quizPct", Assignment: "assignmentPct", Midterm: "midtermPct", Final: "finalPct", Project: "projectPct", Lab: "labPct",
};
const POLICY_MAX_KEY: Record<string, keyof PolicyMax> = {
  Quiz: "quizMax", Assignment: "assignmentMax", Midterm: "midtermMax", Final: "finalMax", Project: "projectMax", Lab: "labMax",
};

export default function AssessmentsManager({ courseId, initialInstruments, targets, policyMax, rows, apiBase }: {
  courseId: string; initialInstruments: Instrument[]; targets: Targets; policyMax?: PolicyMax; rows: Row[]; apiBase: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyCell, setBusyCell] = useState<string | null>(null);

  async function addInstrument(type: string, nextLabel: string, marksPct: string, maxScore: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/instruments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, label: nextLabel, marksPct, maxScore }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function editInstrument(id: string, marksPct: number) {
    setBusyCell(id); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/instruments/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marksPct }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyCell(null); return; }
      setBusyCell(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyCell(null); }
  }

  async function removeInstrument(id: string) {
    setLoading(true);
    await fetch(`${apiBase}/courses/${courseId}/instruments/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function toggleInstrument(rowId: string, instrumentId: string, linked: boolean) {
    const key = rowId + instrumentId;
    setBusyCell(key);
    await fetch(`${apiBase}/courses/${courseId}/lecture/${rowId}/instrument-toggle`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instrumentId, linked }),
    });
    setBusyCell(null); router.refresh();
  }

  async function saveQuestions(rowId: string, type: "Midterm" | "Final", value: string) {
    const key = rowId + type;
    setBusyCell(key); setError("");
    try {
      const res = await fetch(`${apiBase}/courses/${courseId}/lecture/${rowId}/set-questions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, numbers: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyCell(null); return; }
      setBusyCell(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyCell(null); }
  }

  const checkboxInstruments = initialInstruments.filter((i) => i.type === "Quiz" || i.type === "Assignment");
  const hasMidterm = initialInstruments.some((i) => i.type === "Midterm");
  const hasFinal = initialInstruments.some((i) => i.type === "Final");
  const filledRows = rows.filter((r) => r.topic.trim().length > 0);

  return (
    <>
      {error && <div className="err">{error}</div>}

      {TYPES.map((type) => {
        const items = initialInstruments.filter((i) => i.type === type);
        const sum = items.reduce((s, i) => s + i.marksPct, 0);
        const target = targets[TARGET_KEY[type]];
        const max = policyMax?.[POLICY_MAX_KEY[type]];
        const overTarget = items.length > 0 && sum !== target;
        const overPolicy = items.length > 0 && max !== undefined && sum > max;
        const isNumbered = type === "Midterm" || type === "Final";
        const nextLabel = isNumbered ? String(items.length + 1) : `${type} ${items.length + 1}`;
        return (
          <div className="card" key={type}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14 }}>{type}</h3>
              <span style={{ fontSize: 11.5, color: overPolicy ? "var(--rust)" : overTarget ? "var(--brass-dark)" : "var(--slate)" }}>
                {sum}% defined {target ? `(your target: ${target}%${max !== undefined ? `, OMC max: ${max}%` : ""})` : ""}
              </span>
            </div>
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
              <thead><tr><th>{isNumbered ? "Question #" : "Label"}</th><th>Marks %</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None defined yet.</td></tr>}
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{isNumbered ? `Q${i.label}` : i.label}</td>
                    <td>
                      <input
                        type="number" min={0} max={100} defaultValue={i.marksPct} disabled={busyCell === i.id}
                        onBlur={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n !== i.marksPct) editInstrument(i.id, n); }}
                        style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12.5 }}
                      />%
                    </td>
                    <td><button onClick={() => removeInstrument(i.id)} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
            <AddRow type={type} nextLabel={nextLabel} loading={loading} onAdd={addInstrument} />
          </div>
        );
      })}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Which Lectures Does Each Instrument Test?</h3>
        {filledRows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Fill in some lecture topics on the Lecture Content tab first.</p>
        ) : initialInstruments.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Define at least one instrument above first.</p>
        ) : (
          <SortableTable>
            <thead>
              <tr>
                <th>Topic</th>
                {checkboxInstruments.map((i) => <th key={i.id} style={{ textAlign: "center", fontSize: 11 }}>{i.type} {i.label}</th>)}
                {hasMidterm && <th style={{ fontSize: 11 }}>Midterm Q#</th>}
                {hasFinal && <th style={{ fontSize: 11 }}>Final Q#</th>}
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {filledRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>Wk{r.week}·L{r.lectureNumber} — {r.topic}</td>
                  {checkboxInstruments.map((i) => {
                    const checked = r.linkedInstrumentIds.includes(i.id);
                    const key = r.id + i.id;
                    return <td key={i.id} style={{ textAlign: "center" }}><input type="checkbox" checked={checked} disabled={busyCell === key} onChange={(e) => toggleInstrument(r.id, i.id, e.target.checked)} /></td>;
                  })}
                  {hasMidterm && (
                    <td><input defaultValue={r.midtermQuestions} placeholder="e.g. 1,3" disabled={busyCell === r.id + "Midterm"}
                      onBlur={(e) => { if (e.target.value !== r.midtermQuestions) saveQuestions(r.id, "Midterm", e.target.value); }}
                      style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12 }} /></td>
                  )}
                  {hasFinal && (
                    <td><input defaultValue={r.finalQuestions} placeholder="e.g. 2" disabled={busyCell === r.id + "Final"}
                      onBlur={(e) => { if (e.target.value !== r.finalQuestions) saveQuestions(r.id, "Final", e.target.value); }}
                      style={{ width: 60, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12 }} /></td>
                  )}
                  <td style={{ fontWeight: 600 }}>{r.weightPct}%</td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        )}
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
          If a quiz, assignment, or question is linked to more than one lecture, its marks are split evenly across them.
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
