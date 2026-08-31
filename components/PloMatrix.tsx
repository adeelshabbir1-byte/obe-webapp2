"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plo = { id: string; number: number; title: string; status: string };
type Course = { id: string; code: string; title: string; courseType: string; semesterNumber: number | null; mappedPloIds: string[] };
type Program = { coordinatorId: string; coordinatorName: string; plos: Plo[]; courses: Course[] };

export default function PloMatrix({ programs }: { programs: Program[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function toggle(courseId: string, ploId: string, mapped: boolean) {
    const key = courseId + ploId;
    setBusyKey(key);
    await fetch("/api/omc/plo-matrix/toggle", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, ploId, mapped }),
    });
    setBusyKey(null);
    router.refresh();
  }

  if (programs.length === 0) {
    return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No programs/courses to map yet.</p></div>;
  }

  return (
    <>
      {programs.map((prog) => (
        <div className="card" key={prog.coordinatorId} style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>{prog.coordinatorName}'s Program</h3>
          {prog.plos.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 8 }}>No PLOs defined for this program yet.</p>
          ) : prog.courses.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 8 }}>No courses in this program yet.</p>
          ) : (
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Course</th><th>Type</th><th>Sem</th>
                  {prog.plos.map((p) => (
                    <th key={p.id} style={{ textAlign: "center", writingMode: "vertical-rl", transform: "rotate(180deg)", height: 90, whiteSpace: "nowrap" }}>
                      PLO-{p.number}{p.status !== "approved" ? " *" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prog.courses.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: "nowrap" }}><b>{c.code}</b><br /><span style={{ color: "var(--slate)", fontSize: 11 }}>{c.title}</span></td>
                    <td style={{ fontSize: 11.5 }}>{c.courseType}</td>
                    <td style={{ fontSize: 11.5 }}>{c.semesterNumber ?? "—"}</td>
                    {prog.plos.map((p) => {
                      const checked = c.mappedPloIds.includes(p.id);
                      const key = c.id + p.id;
                      return (
                        <td key={p.id} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox" checked={checked} disabled={busyKey === key}
                            onChange={(e) => toggle(c.id, p.id, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {prog.plos.some((p) => p.status !== "approved") && (
            <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>* PLO not yet approved by Chairman</div>
          )}
        </div>
      ))}
    </>
  );
}
