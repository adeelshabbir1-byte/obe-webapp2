"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; code: string; title: string; batch: string; teacher: string };

export default function HodApprovals({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(courseId: string, decision: "APPROVE" | "REJECT") {
    let note = "";
    if (decision === "REJECT") {
      const n = window.prompt("Reason for rejecting (the Course Assigner will see this):");
      if (!n || !n.trim()) return;
      note = n;
    }
    setBusy(courseId); setError("");
    const res = await fetch("/api/hod/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, decision, note }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Something went wrong"); return; }
    router.refresh();
  }

  return (
    <>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      <table>
        <thead><tr><th>Code</th><th>Title</th><th>Batch</th><th>Proposed teacher</th><th></th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing waiting for your approval.</td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.code}</td><td>{i.title}</td><td>{i.batch}</td><td><b>{i.teacher}</b></td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-brass" disabled={busy === i.id} onClick={() => decide(i.id, "APPROVE")}>Approve</button>{" "}
                <button className="btn" disabled={busy === i.id} onClick={() => decide(i.id, "REJECT")}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
