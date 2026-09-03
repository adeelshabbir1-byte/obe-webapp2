"use client";

type Batch = { id: string; degreeProgram: string; batchName: string };

export default function DegreeBatchFilter({ batches, selectedDegree, selectedBatchId, extraParams }: {
  batches: Batch[]; selectedDegree: string; selectedBatchId: string; extraParams?: Record<string, string>;
}) {
  const degrees = Array.from(new Set(batches.map((b) => b.degreeProgram)));
  const filteredBatches = selectedDegree ? batches.filter((b) => b.degreeProgram === selectedDegree) : batches;

  return (
    <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
      {extraParams && Object.entries(extraParams).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>Degree</label>
        <select name="degree" defaultValue={selectedDegree} onChange={(e) => e.currentTarget.form?.submit()} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
          <option value="">All Degrees</option>
          {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>Batch</label>
        <select name="batchId" defaultValue={selectedBatchId} onChange={(e) => e.currentTarget.form?.submit()} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
          <option value="">All Batches</option>
          {filteredBatches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
        </select>
      </div>
    </form>
  );
}
