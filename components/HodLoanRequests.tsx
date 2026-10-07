"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; teacher: string; course: string; from: string; note: string | null };

export default function HodLoanRequests({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function decide(loanId: string, decision: "APPROVE" | "REJECT") {
    let note = "";
    if (decision === "REJECT") {
      const n = window.prompt("Reason for declining (they will see this):");
      if (!n || !n.trim()) return;
      note = n;
    }
    setBusy(loanId); setError("");
    const res = await fetch("/api/hod/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanId, decision, note }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Something went wrong"); return; }
    router.refresh();
  }

  return (
    <>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      <table>
        <thead><tr><th>Your teacher</th><th>For course</th><th>Asked by</th><th>Note</th><th></th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No requests waiting.</td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td><b>{i.teacher}</b></td><td>{i.course}</td><td>{i.from}</td><td>{i.note || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-brass" disabled={busy === i.id} onClick={() => decide(i.id, "APPROVE")}>Lend</button>{" "}
                <button className="btn" disabled={busy === i.id} onClick={() => decide(i.id, "REJECT")}>Decline</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
