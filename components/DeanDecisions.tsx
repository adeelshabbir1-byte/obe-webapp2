"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LoanItem = { id: string; kind: string; course: string; from: string; to: string; asked: string | null; note: string | null; side: string };
type CurrItem = { id: string; title: string; authority: string; version: string; status: string | null; note: string | null };

function useSender() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function send(id: string, url: string, body: unknown) {
    setBusy(id); setError("");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Something went wrong"); return; }
    router.refresh();
  }
  return { busy, error, send };
}

export function DeanLoanDecisions({ items }: { items: LoanItem[] }) {
  const { busy, error, send } = useSender();
  function decide(id: string, decision: "APPROVE" | "REJECT") {
    let note = "";
    if (decision === "REJECT") {
      const n = window.prompt("Reason for declining (the requester will see this):");
      if (!n || !n.trim()) return;
      note = n;
    }
    send(id, "/api/dean/loans", { loanId: id, decision, note });
  }
  return (
    <>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      <table>
        <thead><tr><th>Course</th><th>Type</th><th>Asking department</th><th>Asked from</th><th>Who</th><th></th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>Nothing waiting for you.</td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.course}{i.note && <div style={{ fontSize: 12, color: "var(--slate)" }}>“{i.note}”</div>}</td>
              <td>{i.kind === "SUBJECT_EXPERT" ? "Subject Expert" : "Teacher"}</td>
              <td>{i.to}</td><td>{i.from}</td><td>{i.asked || "any suitable"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-brass" disabled={busy === i.id} onClick={() => decide(i.id, "APPROVE")}>Approve</button>{" "}
                <button className="btn" disabled={busy === i.id} onClick={() => decide(i.id, "REJECT")}>Decline</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function DeanCurriculumDecisions({ items }: { items: CurrItem[] }) {
  const { busy, error, send } = useSender();
  function decide(id: string, status: "APPROVED" | "RETURNED") {
    let note = "";
    if (status === "RETURNED") {
      const n = window.prompt("What needs to change?");
      if (!n || !n.trim()) return;
      note = n;
    }
    send(id, "/api/dean/curricula", { curriculumId: id, status, note });
  }
  return (
    <>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      <table>
        <thead><tr><th>Curriculum</th><th>Authority</th><th>Version</th><th>Your sign-off</th><th></th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>The institute has no curricula yet.</td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.title}</td><td>{i.authority}</td><td>{i.version}</td>
              <td style={{ color: i.status === "APPROVED" ? "var(--sage)" : i.status === "RETURNED" ? "#b3261e" : "var(--slate)" }}>
                <b>{i.status === "APPROVED" ? "APPROVED" : i.status === "RETURNED" ? "RETURNED" : "not yet"}</b>{i.note ? ` — ${i.note}` : ""}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-brass" disabled={busy === i.id} onClick={() => decide(i.id, "APPROVED")}>Approve</button>{" "}
                <button className="btn" disabled={busy === i.id} onClick={() => decide(i.id, "RETURNED")}>Return for changes</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
