"use client";

import { useState, useEffect } from "react";

type Member = { courseId: string; isBase: boolean; isSelf: boolean; isHistorical: boolean; code: string; title: string; degreeProgram: string; batchName: string; termOrder: number };

export default function ContentSyncStatusBanner({ courseId }: { courseId: string }) {
  const [data, setData] = useState<{ inGroup: boolean; isBase?: boolean; base?: Member | null; members?: Member[] } | null>(null);

  useEffect(() => {
    fetch(`/api/subjectexpert/courses/${courseId}/content-sync-status`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [courseId]);

  if (!data || !data.inGroup || !data.members) return null;

  const others = data.members.filter((m) => !m.isSelf);

  return (
    <div className="card" style={{ borderColor: "var(--brass)", background: "#FBEED2" }}>
      {data.isBase ? (
        <p style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>
          <b>This is the base course</b> — its CLOs, lecture plan, and assessments are the real, editable data. It's
          automatically shared forward into every course listed below as those future batches come up.
        </p>
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>
          <b>This course inherits its content</b> from {data.base ? `${data.base.code} — ${data.base.title} (${data.base.degreeProgram}, ${data.base.batchName})` : "another course"} — that's
          where the real, editable data lives. Edit it there; it flows into this course automatically.
        </p>
      )}
      {others.length > 0 && (
        <table style={{ width: "100%", marginTop: 8, fontSize: 11.5, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--slate)" }}>
              <th style={{ padding: "3px 6px" }}>Course</th>
              <th style={{ padding: "3px 6px" }}>Batch</th>
              <th style={{ padding: "3px 6px" }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.courseId} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", fontWeight: m.isSelf ? 700 : 400 }}>
                <td style={{ padding: "3px 6px" }}>{m.code} — {m.title}</td>
                <td style={{ padding: "3px 6px" }}>{m.degreeProgram}, {m.batchName}</td>
                <td style={{ padding: "3px 6px" }}>{m.isBase ? "★ has the data" : m.isHistorical ? "already taught (historical)" : "inherits"}{m.isSelf ? " (this course)" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
