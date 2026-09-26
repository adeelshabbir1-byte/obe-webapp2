"use client";

import { useState } from "react";
import SortableTable from "./SortableTable";
import { colorForTopic } from "../lib/topicColor";

type Clo = { id: string; code: string };
type Row = { id: string; week: number; lectureNumber: number; topic: string; subtopic: string | null; cloId: string | null; cloCode?: string | null; bloomLevel: string | null; weightPct: number; actualDate: string | null; seTopic: string; rescheduledNote: string | null; holidayConflict?: string | null };
type SePlanRow = { lectureNumber: number; week: number; topic: string; subtopic: string | null; cloCode: string | null; bloomLevel: string | null; weightPct: number };

const BLOOM_OPTIONS = ["", "C1", "C2", "C3", "C4", "C5", "C6"];

function normalizeRow(raw: any, prev: Row): Row {
  return {
    ...prev,
    topic: raw.topic, subtopic: raw.subtopic, cloId: raw.cloId, bloomLevel: raw.bloomLevel,
    weightPct: raw.weightPct, actualDate: raw.actualDate ? new Date(raw.actualDate).toISOString() : null,
    rescheduledNote: raw.rescheduledNote,
  };
}

// Every action updates local state from its own response — a cell
// edit touches one row, a move swaps two, auto-fill genuinely does
// touch most/all rows (so returning the full list there is correct,
// not wasteful) — none of them re-fetch the whole page anymore.
export default function InstructorLectureContentManager({ courseId, initialRows, sePlan, clos }: { courseId: string; initialRows: Row[]; sePlan: SePlanRow[]; clos: Clo[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState("");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);
  const [view, setView] = useState<"mine" | "se">("mine");

  const sePlanByLecture = new Map(sePlan.map((r) => [r.lectureNumber, r]));

  async function autoFillDates() {
    setAutoFilling(true); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/lecture/auto-fill-dates`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setAutoFilling(false); return; }
      setRows((prev) => {
        const byId: Map<string, any> = new Map((data.rows || []).map((r: any) => [r.id, r]));
        return prev.map((r) => byId.has(r.id) ? normalizeRow(byId.get(r.id), r) : r);
      });
      setAutoFilling(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setAutoFilling(false); }
  }

  async function saveField(row: Row, patch: Partial<{ topic: string; subtopic: string; cloId: string; bloomLevel: string; actualDate: string }>, revertEl?: HTMLInputElement, revertValue?: string) {
    setBusyRow(row.id); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/lecture/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: patch.topic ?? row.topic, subtopic: patch.subtopic ?? row.subtopic,
          cloId: (patch.cloId ?? row.cloId) || null, bloomLevel: (patch.bloomLevel ?? row.bloomLevel) || null,
          actualDate: patch.actualDate ?? row.actualDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        if (revertEl) { revertEl.value = revertValue || ""; revertEl.style.borderColor = "var(--rust)"; setTimeout(() => { revertEl.style.borderColor = ""; }, 1500); }
        setBusyRow(null); return;
      }
      const cloCode = data.row.cloId ? clos.find((c) => c.id === data.row.cloId)?.code || null : null;
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...normalizeRow(data.row, r), cloCode } : r));
      setBusyRow(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyRow(null); }
  }

  async function moveLecture(lectureId: string, direction: "up" | "down") {
    setBusyRow(lectureId); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/lecture/${lectureId}/move`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyRow(null); return; }
      setRows((prev) => {
        const byId: Map<string, any> = new Map((data.rows || []).map((r: any) => [r.id, r]));
        return prev.map((r) => {
          if (!byId.has(r.id)) return r;
          const raw: any = byId.get(r.id);
          const cloCode = raw.cloId ? clos.find((c) => c.id === raw.cloId)?.code || null : null;
          return { ...normalizeRow(raw, r), cloCode };
        });
      });
      setBusyRow(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyRow(null); }
  }

  const filledCount = rows.filter((r) => r.actualDate).length;

  // A changed cell gets a small amber left-border flag — comparing against
  // the Subject Expert's corresponding value for that same lecture number.
  const CHANGED_STYLE = { boxShadow: "inset 3px 0 0 0 #D97706" };

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14 }}>Lecture Content — Actual Delivery</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{filledCount} / {rows.length} lectures dated</span>
            <button onClick={autoFillDates} disabled={autoFilling} className="btn btn-ai" style={{ padding: "5px 10px", fontSize: 11.5 }}>
              {autoFilling ? "Filling…" : "Auto-fill Dates"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid var(--line)" }}>
          <button onClick={() => setView("mine")} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, background: "none", border: "none", borderBottom: view === "mine" ? "2px solid var(--brass-dark)" : "2px solid transparent", color: view === "mine" ? "var(--brass-dark)" : "var(--slate)", cursor: "pointer" }}>
            My Plan (Editable)
          </button>
          <button onClick={() => setView("se")} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, background: "none", border: "none", borderBottom: view === "se" ? "2px solid var(--brass-dark)" : "2px solid transparent", color: view === "se" ? "var(--brass-dark)" : "var(--slate)", cursor: "pointer" }}>
            Subject Expert's Plan (Reference)
          </button>
        </div>

        {view === "mine" && (
          <>
            <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10, marginTop: -4 }}>
              Set lectures 1 and 2's dates below first, then click Auto-fill — the rest follow the same weekly pattern,
              skipping holidays and this course's exam dates. Any date you've already changed stays as you set it.
              A field with an amber edge means it's different from the Subject Expert's plan for that lecture.
              Use the ▲▼ buttons next to a lecture number to move that topic to a different week/lecture slot —
              its date stays with the slot, not the topic.
            </p>
            <SortableTable paginate={false} style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }} rowSpan={2}>Wk</th>
                  <th style={{ width: 50 }} rowSpan={2}>Lec</th>
                  <th colSpan={1} style={{ background: "#F3F6FD", textAlign: "center" }}>Subject Expert (Planned)</th>
                  <th colSpan={6} style={{ background: "#EDF6FF", textAlign: "center" }}>Lecturer (Actual Delivery)</th>
                </tr>
                <tr>
                  <th style={{ width: "16%", background: "#F3F6FD" }}>Topic</th>
                  <th style={{ width: "20%" }}>Topic</th>
                  <th style={{ width: "16%" }}>Sub Topic</th>
                  <th style={{ width: 110 }}>Actual Date</th>
                  <th style={{ width: 80 }}>CLO</th>
                  <th style={{ width: 80 }}>Bloom</th>
                  <th style={{ width: 60 }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const se = sePlanByLecture.get(r.lectureNumber);
                  const topicChanged = se && r.topic !== se.topic;
                  const subtopicChanged = se && (r.subtopic || "") !== (se.subtopic || "");
                  const cloChanged = se && (r.cloCode || null) !== (se.cloCode || null);
                  const bloomChanged = se && (r.bloomLevel || "") !== (se.bloomLevel || "");
                  return (
                    <tr key={r.id}>
                      <td style={{ color: "var(--slate)", fontSize: 12 }}>{r.week}</td>
                      <td style={{ color: "var(--slate)", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span>{r.lectureNumber}</span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <button onClick={() => moveLecture(r.id, "up")} disabled={busyRow === r.id} title="Move this topic up a slot" style={{ background: "none", border: "1px solid var(--line)", cursor: "pointer", fontSize: 8, lineHeight: 1, padding: "1px 3px" }}>▲</button>
                            <button onClick={() => moveLecture(r.id, "down")} disabled={busyRow === r.id} title="Move this topic down a slot" style={{ background: "none", border: "1px solid var(--line)", cursor: "pointer", fontSize: 8, lineHeight: 1, padding: "1px 3px" }}>▼</button>
                          </span>
                        </div>
                      </td>
                      <td style={{ color: "var(--ink)", fontSize: 11.5, background: "#F3F6FD", fontWeight: 500 }}>{r.seTopic || "—"}</td>
                      <td style={{ background: colorForTopic(r.topic), padding: 0, ...(topicChanged ? CHANGED_STYLE : {}) }} title={topicChanged ? `Subject Expert planned: "${se!.topic}"` : undefined}>
                        <input key={`topic-${r.id}-${r.topic}`} defaultValue={r.topic} disabled={busyRow === r.id} placeholder="Actual topic..."
                          onBlur={(e) => { if (e.target.value !== r.topic) saveField(r, { topic: e.target.value }); }}
                          style={{ width: "100%", padding: "8px 9px", border: "none", background: "transparent", fontSize: 12.5 }} />
                      </td>
                      <td style={{ padding: 0, ...(subtopicChanged ? CHANGED_STYLE : {}) }} title={subtopicChanged ? `Subject Expert planned: "${se!.subtopic || "—"}"` : undefined}>
                        <input key={`subtopic-${r.id}-${r.subtopic}`} defaultValue={r.subtopic || ""} disabled={busyRow === r.id} placeholder="Sub topic..."
                          onBlur={(e) => { if (e.target.value !== (r.subtopic || "")) saveField(r, { subtopic: e.target.value }); }}
                          style={{ width: "100%", padding: "8px 9px", border: "none", background: "transparent", fontSize: 12.5 }} />
                      </td>
                      <td style={{ padding: 0, background: (r.rescheduledNote || r.holidayConflict) ? "#FFE8ED" : undefined }} title={r.rescheduledNote || (r.holidayConflict ? `Conflicts with holiday: ${r.holidayConflict}` : undefined)}>
                        <input key={`date-${r.id}-${r.actualDate}`} type="date" defaultValue={r.actualDate ? r.actualDate.slice(0, 10) : ""} disabled={busyRow === r.id}
                          onBlur={(e) => { const prev = r.actualDate ? r.actualDate.slice(0, 10) : ""; if (e.target.value !== prev) saveField(r, { actualDate: e.target.value }, e.target, prev); }}
                          style={{ width: "100%", padding: "6px 6px", border: "none", background: "transparent", fontSize: 11.5 }} />
                        {r.rescheduledNote && <div style={{ fontSize: 9.5, color: "var(--rust)", padding: "0 4px 3px" }}>Rescheduled</div>}
                        {r.holidayConflict && !r.rescheduledNote && <div style={{ fontSize: 9.5, color: "var(--rust)", padding: "0 4px 3px" }}>⚠ Holiday: {r.holidayConflict}</div>}
                      </td>
                      <td style={{ padding: 0, ...(cloChanged ? CHANGED_STYLE : {}) }} title={cloChanged ? `Subject Expert planned: ${se!.cloCode || "—"}` : undefined}>
                        <select key={`clo-${r.id}-${r.cloId}`} defaultValue={r.cloId || ""} disabled={busyRow === r.id} onChange={(e) => saveField(r, { cloId: e.target.value })}
                          style={{ width: "100%", padding: "8px 6px", border: "none", background: "transparent", fontSize: 12 }}>
                          <option value="">—</option>
                          {clos.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: 0, ...(bloomChanged ? CHANGED_STYLE : {}) }} title={bloomChanged ? `Subject Expert planned: ${se!.bloomLevel || "—"}` : undefined}>
                        <select key={`bloom-${r.id}-${r.bloomLevel}`} defaultValue={r.bloomLevel || ""} disabled={busyRow === r.id} onChange={(e) => saveField(r, { bloomLevel: e.target.value })}
                          style={{ width: "100%", padding: "8px 6px", border: "none", background: "transparent", fontSize: 12 }}>
                          {BLOOM_OPTIONS.map((b) => <option key={b} value={b}>{b || "—"}</option>)}
                        </select>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{r.weightPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </SortableTable>
          </>
        )}

        {view === "se" && (
          <>
            <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10, marginTop: -4 }}>
              The Subject Expert's full plan for this course — read-only, for reference while you log your actual delivery.
            </p>
            <SortableTable paginate={false} style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>Wk</th><th style={{ width: 34 }}>Lec</th>
                  <th style={{ width: "26%" }}>Topic</th><th style={{ width: "22%" }}>Sub Topic</th>
                  <th style={{ width: 80 }}>CLO</th><th style={{ width: 80 }}>Bloom</th><th style={{ width: 60 }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {sePlan.length === 0 && <tr><td colSpan={7} style={{ color: "var(--slate)" }}>The Subject Expert hasn't built a lecture plan yet.</td></tr>}
                {sePlan.map((r) => (
                  <tr key={r.lectureNumber}>
                    <td style={{ fontSize: 12 }}>{r.week}</td>
                    <td style={{ fontSize: 12 }}>{r.lectureNumber}</td>
                    <td style={{ fontSize: 12.5 }}>{r.topic || "—"}</td>
                    <td style={{ fontSize: 12.5 }}>{r.subtopic || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.cloCode || "—"}</td>
                    <td style={{ fontSize: 12 }}>{r.bloomLevel || "—"}</td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{r.weightPct}%</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </>
        )}
      </div>
    </>
  );
}
