"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Policy = {
  courseType: string;
  updatedByName?: string | null;
  assignmentMin: number; assignmentMax: number; assignmentMinCount: number;
  quizMin: number; quizMax: number; quizMinCount: number;
  projectMin: number; projectMax: number; projectMinCount: number;
  labMin: number; labMax: number; labMinCount: number;
  midtermMin: number; midtermMax: number; midtermMinCount: number;
  finalMin: number; finalMax: number; finalMinCount: number;
};

const COMPONENTS: { key: string; label: string }[] = [
  { key: "assignment", label: "Assignment" }, { key: "quiz", label: "Quiz" }, { key: "project", label: "Project" },
  { key: "lab", label: "Lab" }, { key: "midterm", label: "Midterm" }, { key: "final", label: "Final" },
];

export default function WeightPolicyManager({ initialPolicies }: { initialPolicies: Policy[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [savingType, setSavingType] = useState<string | null>(null);
  const [savedType, setSavedType] = useState<string | null>(null);

  async function saveRow(courseType: string) {
    setSavingType(courseType); setError(""); setSavedType(null);
    const body: Record<string, any> = { courseType };
    for (const c of COMPONENTS) {
      const min = (document.getElementById(`${courseType}-${c.key}-min`) as HTMLInputElement)?.value;
      const max = (document.getElementById(`${courseType}-${c.key}-max`) as HTMLInputElement)?.value;
      const count = (document.getElementById(`${courseType}-${c.key}-count`) as HTMLInputElement)?.value;
      body[`${c.key}Min`] = min; body[`${c.key}Max`] = max; body[`${c.key}MinCount`] = count;
    }
    try {
      const res = await fetch("/api/omc/weight-policy", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingType(null); return; }
      setSavedType(courseType); setSavingType(null); router.refresh();
      setTimeout(() => setSavedType(null), 2000);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingType(null); }
  }

  const cellInput = (id: string, defaultValue: number, width: number) => (
    <input id={id} type="number" min={0} defaultValue={defaultValue} style={{ width, padding: "4px 5px", border: "1px solid var(--line)", fontSize: 12, textAlign: "center" }} />
  );

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {error && <div className="err">{error}</div>}
      <SortableTable className="xlgrid" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ border: "1px solid var(--line)", padding: "6px 8px", verticalAlign: "bottom", background: "var(--surface-1, #E8E6FB)" }}>Course Type</th>
            {COMPONENTS.map((c) => (
              <th key={c.key} colSpan={3} style={{ border: "1px solid var(--line)", padding: "6px 8px", textAlign: "center", background: "var(--surface-1, #E8E6FB)" }}>{c.label}</th>
            ))}
            <th rowSpan={2} style={{ border: "1px solid var(--line)", padding: "6px 8px", verticalAlign: "bottom", background: "var(--surface-1, #E8E6FB)" }}></th>
          </tr>
          <tr>
            {COMPONENTS.map((c) => (
              <Fragment key={c.key}>
                <th style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 500 }}>Min %</th>
                <th style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 500 }}>Max %</th>
                <th style={{ border: "1px solid var(--line)", padding: "4px 6px", fontSize: 10.5, fontWeight: 500 }}># Min</th>
              </Fragment>
            ))}
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
                  <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center" }}>
                    {cellInput(`${p.courseType}-${c.key}-min`, (p as any)[`${c.key}Min`], 42)}
                  </td>
                  <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center" }}>
                    {cellInput(`${p.courseType}-${c.key}-max`, (p as any)[`${c.key}Max`], 42)}
                  </td>
                  <td style={{ border: "1px solid var(--line)", padding: "4px 6px", textAlign: "center" }}>
                    {cellInput(`${p.courseType}-${c.key}-count`, (p as any)[`${c.key}MinCount`], 36)}
                  </td>
                </Fragment>
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
        "# Min" is the minimum number of that assessment type to be conducted (e.g. 3 quizzes, 2 assignments).
      </p>
    </div>
  );
}
