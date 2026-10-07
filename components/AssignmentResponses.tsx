"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { courseId: string; as: "INSTRUCTOR" | "SUBJECT_EXPERT"; course: string; batch: string; from: string };

export default function AssignmentResponses({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function answer(it: Item, decision: "ACCEPT" | "DECLINE") {
    let note = "";
    if (decision === "DECLINE") {
      const n = window.prompt("Reason for declining (they will see this):");
      if (!n || !n.trim()) return;
      note = n;
    }
    setBusy(it.courseId + it.as); setError("");
    const res = await fetch("/api/faculty/assignment-response", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: it.courseId, as: it.as, decision, note }) });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(d.error || "Something went wrong"); return; }
    router.refresh();
  }

  if (items.length === 0) return null;
  return (
    <div className="card" style={{ borderLeft: "4px solid #96650F", marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Courses offered to you ({items.length})</h3>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>These courses were given to you by another department. Accept or decline each one.</p>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      <table>
        <thead><tr><th>Course</th><th>As</th><th>Batch</th><th>From</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.courseId + it.as}>
              <td><b>{it.course}</b></td><td>{it.as === "SUBJECT_EXPERT" ? "Subject Expert" : "Instructor"}</td><td>{it.batch}</td><td>{it.from}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-brass" disabled={busy === it.courseId + it.as} onClick={() => answer(it, "ACCEPT")}>Accept</button>{" "}
                <button className="btn" disabled={busy === it.courseId + it.as} onClick={() => answer(it, "DECLINE")}>Decline</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
