"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";

type Policy = {
  courseType: string;
  updatedByName?: string | null;
  assignmentMin: number; assignmentMax: number; assignmentMinCount: number;
  quizMin: number; quizMax: number; quizMinCount: number;
  projectMin: number; projectMax: number; projectMinCount: number;
  labMin: number; labMax: number; labMinCount: number;
  midtermMin: number; midtermMax: number; midtermMinCount: number;
  finalMin: number; finalMax: number; finalMinCount: number; finalBeforeMidtermPct?: number | null;
  ploMinPct?: number; ploMinItems?: number; cloSpreadMax?: number;
};

const COMPONENTS: { key: string; label: string; color: string }[] = [
  { key: "assignment", label: "Assignment", color: "#3F66A0" },
  { key: "quiz", label: "Quiz", color: "#1D8A4E" },
  { key: "project", label: "Project", color: "#5A4AA0" },
  { key: "lab", label: "Lab", color: "#A85D1F" },
  { key: "midterm", label: "Midterm", color: "#8A3A5C" },
  { key: "final", label: "Final", color: "#96650F" },
];
const MIN_BG = "#E3EBF3";   // light warm blue — every Min % cell
const MAX_BG = "#E4F0D6";   // light warm green — every Max % cell
const COUNT_BG = "#FBEED2"; // light warm gold — every # Min (minimum count) cell
const PLO_BG = "#EFEAF8";   // light violet — assessment-coverage rules
const COVERAGE: { key: "ploMinPct" | "ploMinItems" | "cloSpreadMax"; label: string; tip: string; dflt: number }[] = [
  { key: "ploMinPct", label: "PLO min % marks", tip: "Every PLO a course serves must carry at least this % of the course marks (0 = no rule).", dflt: 0 },
  { key: "ploMinItems", label: "PLO min # items", tip: "Every PLO a course serves must be tested by at least this many assessment items - quizzes, assignments, midterm, final (0 = no rule).", dflt: 0 },
  { key: "cloSpreadMax", label: "CLO max spread %", tip: "Largest allowed gap between the most and the least assessed CLO, in % of marks.", dflt: 7 },
];

export default function WeightPolicyManager({ initialPolicies }: { initialPolicies: Policy[] }) {
  const [error, setError] = useState("");
  const [savingType, setSavingType] = useState<string | null>(null);
  const [savedType, setSavedType] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function saveRow(courseType: string) {
    setSavingType(courseType); setError(""); setSavedType(null);
    const body: Record<string, any> = { courseType };
    for (const c of COMPONENTS) {
      const min = (document.getElementById(`${courseType}-${c.key}-min`) as HTMLInputElement)?.value;
      const max = (document.getElementById(`${courseType}-${c.key}-max`) as HTMLInputElement)?.value;
      const count = (document.getElementById(`${courseType}-${c.key}-count`) as HTMLInputElement)?.value;
      body[`${c.key}Min`] = min; body[`${c.key}Max`] = max; body[`${c.key}MinCount`] = count;
    }
    body.finalBeforeMidtermPct = (document.getElementById(`${courseType}-final-boundary`) as HTMLInputElement)?.value ?? "";
    for (const c of COVERAGE) body[c.key] = (document.getElementById(`${courseType}-${c.key}`) as HTMLInputElement)?.value ?? "";
    setNotice("");
    try {
      const res = await fetch("/api/omc/weight-policy", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingType(null); return; }
      setSavedType(courseType); setSavingType(null);
      if (data.adjusted) setNotice(`${data.adjusted} course(s) whose weights were not confirmed yet were moved inside the new limits.`);
      setTimeout(() => setSavedType(null), 2000);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingType(null); }
  }

  const cellInput = (id: string, defaultValue: number, width: number) => (
    <input id={id} type="number" min={0} defaultValue={defaultValue} style={{ width, padding: "4px 5px", border: "1px solid var(--line)", fontSize: 12, textAlign: "center" }} />
  );

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {error && <div className="err">{error}</div>}
      {notice && <div style={{ fontSize: 12.5, color: "var(--sage)", marginBottom: 8 }}>{notice}</div>}
      <SortableTable paginate={false} className="xlgrid" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ border: "1px solid var(--line)", padding: "6px 8px", verticalAlign: "bottom", background: "var(--surface-1, #F3E4E7)" }}>Course Type</th>
            {COMPONENTS.map((c) => (
              <th key={c.key} colSpan={3} style={{ border: "1px solid var(--line)", padding: "6px 8px", textAlign: "center", background: c.color, color: "#fff" }}>{c.label}</th>
            ))}
            <th rowSpan={2} style={{ border: "1px solid var(--line)", padding: "6px 8px", verticalAlign: "bottom", background: "#96650F", color: "#fff", fontSize: 11 }} title="Share of the Final paper that should come from topics taught up to the midterm. The rest comes from after it. Leave blank for no guidance.">Final: % before midterm</th>
            <th colSpan={3} style={{ border: "1px solid var(--line)", padding: "6px 8px", textAlign: "center", background: "#5B4A8C", color: "#fff" }} title="How well each PLO must be assessed">Assessment coverage (PLO is the goal)</th>
            <th rowSpan={2} style={{ border: "1px solid var(--line)", padding: "6px 8px", verticalAlign: "bottom", background: "var(--surface-1, #F3E4E7)" }}></th>
          </tr>
          <tr>
            {COMPONENTS.map((c) => (
              <Fragment key={c.key}>
                <th style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 600, background: MIN_BG }}>Min %</th>
                <th style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 600, background: MAX_BG }}>Max %</th>
                <th style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 600, background: COUNT_BG }}># Min</th>
              </Fragment>
            ))}
            {COVERAGE.map((c) => <th key={c.key} title={c.tip} style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 600, background: PLO_BG }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {initialPolicies.map((p) => (
            <tr key={p.courseType}>
              <td style={{ border: "1px solid var(--line)", padding: "6px 8px", fontWeight: 500, whiteSpace: "nowrap" }}>
                {p.courseType}
                {p.updatedByName && <div style={{ fontSize: 9.5, fontWeight: 400, color: "var(--slate)" }}>by {p.updatedByName}</div>}
              </td>
              {COMPONENTS.map((c) => (
                <Fragment key={c.key}>
                  <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center", background: `${MIN_BG}80` }}>
                    {cellInput(`${p.courseType}-${c.key}-min`, (p as any)[`${c.key}Min`], 42)}
                  </td>
                  <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center", background: `${MAX_BG}80` }}>
                    {cellInput(`${p.courseType}-${c.key}-max`, (p as any)[`${c.key}Max`], 42)}
                  </td>
                  <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center", background: `${COUNT_BG}80` }}>
                    {cellInput(`${p.courseType}-${c.key}-count`, (p as any)[`${c.key}MinCount`], 36)}
                  </td>
                </Fragment>
              ))}
              <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center", background: `${COUNT_BG}80` }}>
                <input id={`${p.courseType}-final-boundary`} type="number" min={0} max={100} placeholder="—" defaultValue={p.finalBeforeMidtermPct ?? ""} style={{ width: 52, padding: "4px 5px", border: "1px solid var(--line)", fontSize: 12, textAlign: "center" }} />
              </td>
              {COVERAGE.map((c) => (
                <td key={c.key} style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center", background: `${PLO_BG}80` }}>
                  {cellInput(`${p.courseType}-${c.key}`, (p as any)[c.key] ?? c.dflt, 46)}
                </td>
              ))}
              <td style={{ border: "1px solid var(--line)", padding: "4px 6px", whiteSpace: "nowrap" }}>
                <button onClick={() => saveRow(p.courseType)} disabled={savingType === p.courseType} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11 }}>
                  {savingType === p.courseType ? "Saving…" : savedType === p.courseType ? "Saved ✓" : "Save"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </SortableTable>
      <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10 }}>
        "# Min" is the minimum number of that assessment type to be conducted (e.g. 3 quizzes, 2 assignments). "Final: % before midterm" is your suggested split of the Final paper — e.g. 30 means about 30% of its marks from topics taught up to the midterm and 70% from after it. Subject Experts see it on the Paper Distribution page and get a warning if their Final is far from it.
        <br /><b>Assessment coverage:</b> "PLO min % marks" and "PLO min # items" set how strongly every PLO a course serves must be assessed (for example 10% of the marks through at least 3 items); a course cannot be submitted until each of its PLOs meets them, and the topics of a PLO that falls short are highlighted on the Assessments page. "CLO max spread %" is the largest gap allowed between the most and the least assessed CLO.
        <br />Course weights the Subject Expert has not confirmed yet always start inside these limits; saving a row moves any such course inside the new limits.
      </p>
    </div>
  );
}
