"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SortableTable from "./SortableTable";

type Section = { id: string; subjectExpertId: string | null; batchLabel: string };
type CourseGroup = {
  code: string; title: string; courseType: string; semesterNumber: number | null;
  customCategoryName: string | null;
  linkedFollowerCodes: string[]; sections: Section[];
};
type SubjectExpert = { id: string; name: string; customCategoryName: string | null };
type Batch = { id: string; degreeProgram: string; batchName: string };

export default function AssignSubjectExpertsManager({ courseGroups: initialGroups, subjectExperts, batches, selectedBatchId }: {
  courseGroups: CourseGroup[]; subjectExperts: SubjectExpert[]; batches: Batch[]; selectedBatchId: string;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<CourseGroup[]>(initialGroups);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchBatch(batchId: string) {
    router.push(batchId ? `/coordinator/assign-subject-experts?batchId=${batchId}` : "/coordinator/assign-subject-experts");
  }

  // Assigns the chosen SE to every section sharing this course code at
  // once — one request per section, run together. If a section's
  // request fails partway through (e.g. it turns out to be a non-base
  // follower after all), that one section's dropdown reverts to its
  // previous value and the rest keep whatever succeeded, rather than
  // silently claiming the whole group updated.
  async function assignSeToGroup(code: string, subjectExpertId: string, revertEl: HTMLSelectElement, revertValue: string) {
    const group = groups.find((g) => g.code === code);
    if (!group) return;
    setLoading(true); setError("");

    const outcomes = await Promise.all(group.sections.map(async (s) => {
      try {
        const res = await fetch(`/api/coordinator/courses/${s.id}/assign-se`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectExpertId: subjectExpertId || null }),
        });
        const data = await res.json().catch(() => ({}));
        return { sectionId: s.id, ok: res.ok, error: data.error as string | undefined };
      } catch (err: any) {
        return { sectionId: s.id, ok: false, error: err?.message };
      }
    }));

    const failures = outcomes.filter((o) => !o.ok);
    setGroups((prev) => prev.map((g) => g.code !== code ? g : {
      ...g,
      sections: g.sections.map((s) => {
        const outcome = outcomes.find((o) => o.sectionId === s.id);
        return outcome?.ok ? { ...s, subjectExpertId: subjectExpertId || null } : s;
      }),
    }));

    if (failures.length > 0) {
      revertEl.value = revertValue;
      setError(
        failures.length === group.sections.length
          ? (failures[0].error || "Couldn't assign to any section — nothing changed.")
          : `Assigned to ${group.sections.length - failures.length}/${group.sections.length} section(s) — ${failures.length} failed: ${failures[0].error || "unknown error"}`
      );
    }
    setLoading(false);
  }

  // Grouped so all courses sharing a category (e.g. "Maths",
  // "Foundation") sit together under their own heading, making it
  // faster to work through one subject area at a time rather than
  // scanning one long list mixed by semester. Uncategorized courses
  // (no CustomCategory set) are shown last, under their own heading.
  const categorized = new Map<string, CourseGroup[]>();
  for (const g of groups) {
    const key = g.customCategoryName || "";
    if (!categorized.has(key)) categorized.set(key, []);
    categorized.get(key)!.push(g);
  }
  const categoryOrder = Array.from(categorized.keys()).sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  });

  function renderSelectOptions(currentValue: string, isMixed: boolean) {
    const categorizedSes = new Map<string, SubjectExpert[]>();
    for (const se of subjectExperts) {
      const key = se.customCategoryName || "";
      if (!categorizedSes.has(key)) categorizedSes.set(key, []);
      categorizedSes.get(key)!.push(se);
    }
    const seCategoryOrder = Array.from(categorizedSes.keys()).sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    });
    return (
      <>
        {isMixed && <option value="" disabled>— Mixed, pick one to unify —</option>}
        <option value="">— Unassigned —</option>
        {seCategoryOrder.map((cat) => (
          cat === "" ? (
            categorizedSes.get(cat)!.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)
          ) : (
            <optgroup key={cat} label={cat}>
              {categorizedSes.get(cat)!.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
            </optgroup>
          )
        ))}
      </>
    );
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      {batches.length > 0 && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Viewing batch</label>
          <select value={selectedBatchId} onChange={(e) => switchBatch(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
          </select>
        </div>
      )}

      {groups.length === 0 && (
        <div className="card"><p style={{ color: "var(--slate)" }}>No assignable courses in this view.</p></div>
      )}

      {categoryOrder.map((cat) => (
        <div key={cat || "uncategorized"} className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{cat || "Uncategorized"}</h3>
          <SortableTable>
            <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Semester</th><th>Sections</th><th>Also Covers</th><th>Subject Expert</th></tr></thead>
            <tbody>
              {categorized.get(cat)!.map((g) => {
                const distinctSe = new Set(g.sections.map((s) => s.subjectExpertId || ""));
                const isMixed = distinctSe.size > 1;
                const currentValue = isMixed ? "" : g.sections[0]?.subjectExpertId || "";
                return (
                  <tr key={g.code}>
                    <td>{g.code}</td><td>{g.title}</td><td>{g.courseType}</td>
                    <td>{g.semesterNumber ?? "—"}</td>
                    <td style={{ fontSize: 11 }}>{g.sections.map((s) => s.batchLabel).join(", ")}</td>
                    <td style={{ fontSize: 11 }}>
                      {g.linkedFollowerCodes.length > 0 ? g.linkedFollowerCodes.join(", ") : <span style={{ color: "var(--slate)" }}>—</span>}
                    </td>
                    <td>
                      <select
                        value={currentValue} disabled={loading}
                        onChange={(e) => assignSeToGroup(g.code, e.target.value, e.target, currentValue)}
                        style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}
                      >
                        {renderSelectOptions(currentValue, isMixed)}
                      </select>
                      {g.sections.length > 1 && (
                        <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>
                          Applies to all {g.sections.length} sections above.
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
        </div>
      ))}
      {subjectExperts.length === 0 && (
        <div className="card"><p style={{ fontSize: 11.5, color: "var(--slate)" }}>No Subject Experts onboarded yet — add one under Faculty Onboarding first.</p></div>
      )}
    </>
  );
}
