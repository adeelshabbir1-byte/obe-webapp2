"use client";

import { useState, Fragment } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Evidence = { id: string; fileName: string; fileUrl: string; status: string; method: string | null; reasoning: string | null; createdAt: string };
type Instrument = { id: string; type: string; label: string; marksPct: number; evidence: Evidence[] };
type Targets = { assignmentPct: number; quizPct: number; midtermPct: number; finalPct: number; projectPct: number; labPct: number };

const TYPES = ["Quiz", "Assignment", "Midterm", "Final", "Project", "Lab"];
const TARGET_KEY: Record<string, keyof Targets> = {
  Quiz: "quizPct", Assignment: "assignmentPct", Midterm: "midtermPct", Final: "finalPct", Project: "projectPct", Lab: "labPct",
};

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; label: string }> = {
    PENDING: { bg: "#eee", label: "Checking…" },
    VALIDATED: { bg: "#BDEBD6", label: "Validated" },
    FLAGGED: { bg: "#F5D0A9", label: "Needs review" },
    ERROR: { bg: "#F5B8B8", label: "Error" },
  };
  const s = styles[status] || styles.PENDING;
  return <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: s.bg }}>{s.label}</span>;
}

export default function InstrumentsManager({ courseId, initialInstruments, targets }: { courseId: string; initialInstruments: Instrument[]; targets: Targets }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function addInstrument(type: string, nextLabel: string, marksPct: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/instruments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, label: nextLabel, marksPct }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeInstrument(id: string) {
    setLoading(true);
    await fetch(`/api/subjectexpert/courses/${courseId}/instruments/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  async function uploadEvidence(instrumentId: string, file: File) {
    setUploadingId(instrumentId); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/instruments/${instrumentId}/evidence`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setUploadingId(null); return; }
      setUploadingId(null); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setUploadingId(null); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {TYPES.map((type) => {
        const items = initialInstruments.filter((i) => i.type === type);
        const sum = items.reduce((s, i) => s + i.marksPct, 0);
        const target = targets[TARGET_KEY[type]];
        const mismatch = items.length > 0 && sum !== target;
        const isNumbered = type === "Midterm" || type === "Final";
        const nextLabel = isNumbered ? String(items.length + 1) : `${type} ${items.length + 1}`;
        return (
          <div className="card" key={type}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14 }}>{type}</h3>
              <span style={{ fontSize: 11.5, color: mismatch ? "var(--rust)" : "var(--slate)" }}>
                {sum}% defined {target ? `(target from Assessment Weights: ${target}%)` : ""}
                {mismatch && <span style={{ marginLeft: 6, fontWeight: 600 }}>— doesn't match</span>}
              </span>
            </div>
            <SortableTable paginate={false}>
              <thead><tr><th>{isNumbered ? "Question #" : "Label"}</th><th>Marks %</th><th>Evidence</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>None defined yet.</td></tr>}
                {items.map((i) => (
                  <Fragment key={i.id}>
                    <tr>
                      <td>{isNumbered ? `Q${i.label}` : i.label}</td><td>{i.marksPct}%</td>
                      <td>
                        {i.evidence.length === 0 ? (
                          <span style={{ fontSize: 11, color: "var(--slate)" }}>None attached</span>
                        ) : (
                          <button onClick={() => setExpandedId(expandedId === i.id ? null : i.id)} style={{ fontSize: 11, background: "none", border: "1px solid var(--line)", padding: "2px 8px", cursor: "pointer" }}>
                            {i.evidence.length} file{i.evidence.length > 1 ? "s" : ""} {statusBadge(i.evidence[0].status)}
                          </button>
                        )}
                      </td>
                      <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <label style={{ fontSize: 11, color: "var(--brass-dark)", textDecoration: "underline", cursor: uploadingId === i.id ? "default" : "pointer" }}>
                          {uploadingId === i.id ? "Uploading…" : "Attach rubric/paper"}
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} disabled={uploadingId === i.id}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(i.id, f); e.target.value = ""; }} />
                        </label>
                        <button onClick={() => removeInstrument(i.id)} className="act act-danger">Remove</button>
                      </td>
                    </tr>
                    {expandedId === i.id && i.evidence.length > 0 && (
                      <tr>
                        <td colSpan={4} style={{ background: "#F7F9FE", padding: 10 }}>
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
            <AddInstrumentRow type={type} nextLabel={nextLabel} loading={loading} onAdd={addInstrument} />
          </div>
        );
      })}
    </>
  );
}

function AddInstrumentRow({ type, nextLabel, loading, onAdd }: { type: string; nextLabel: string; loading: boolean; onAdd: (type: string, label: string, marksPct: string) => void }) {
  const [marksPct, setMarksPct] = useState("");
  const isNumbered = type === "Midterm" || type === "Final";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!marksPct) return;
    onAdd(type, nextLabel, marksPct);
    setMarksPct("");
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--slate)" }}>
        Next: <b style={{ color: "var(--ink)" }}>{isNumbered ? `Q${nextLabel}` : nextLabel}</b>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Marks %</label>
        <input value={marksPct} onChange={(e) => setMarksPct(e.target.value)} type="number" min={0} max={100} required style={{ padding: "6px 8px", border: "1px solid var(--line)", width: 70 }} />
      </div>
      <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "6px 12px", fontSize: 12 }}>Add {isNumbered ? `Q${nextLabel}` : nextLabel}</button>
    </form>
  );
}
