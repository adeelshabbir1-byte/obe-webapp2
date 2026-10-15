"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

const STATUS_TEXT = (status: string | null) => (status === "APPROVED" ? "APPROVED" : status === "RETURNED" ? "RETURNED" : "not yet");
const STATUS_COLOR = (status: string | null) => (status === "APPROVED" ? "var(--sage)" : status === "RETURNED" ? "#b3261e" : "var(--slate)");

/** The Dean's list of curricula. A decision is taken only after opening the curriculum (see DeanCurriculumDecisionPanel). */
export function DeanCurriculumDecisions({ items }: { items: CurrItem[] }) {
  return (
    <table>
      <thead><tr><th>Curriculum</th><th>Authority</th><th>Version</th><th>Your sign-off</th><th></th></tr></thead>
      <tbody>
        {items.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>The institute has no curricula yet.</td></tr>}
        {items.map((i) => (
          <tr key={i.id}>
            <td>{i.title}</td><td>{i.authority}</td><td>{i.version}</td>
            <td style={{ color: STATUS_COLOR(i.status) }}><b>{STATUS_TEXT(i.status)}</b>{i.note ? ` — ${i.note}` : ""}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <Link href={`/dean/curricula/${i.id}`} className="btn btn-brass btn-sm">{i.status ? "Open" : "Open to review"}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Approve / return, shown at the end of the opened curriculum. */
export function DeanCurriculumDecisionPanel({ curriculumId, status, note, decidedAt }: { curriculumId: string; status: string | null; note: string | null; decidedAt: string | null }) {
  const { busy, error, send } = useSender();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="card" style={{ borderColor: "var(--brass)" }}>
      <h3 style={{ marginTop: 0 }}>Your decision</h3>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Current sign-off: <b style={{ color: STATUS_COLOR(status) }}>{STATUS_TEXT(status)}</b>{decidedAt ? ` (${decidedAt})` : ""}{note ? ` — ${note}` : ""}
      </p>
      {error && <div className="err">{error}</div>}
      {returning ? (
        <div style={{ display: "grid", gap: 8, maxWidth: 640 }}>
          <label style={{ fontSize: 12.5 }}>What needs to change? (the Institute Head and the curriculum owners will see this)</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" disabled={busy === curriculumId || !reason.trim()} onClick={() => send(curriculumId, "/api/dean/curricula", { curriculumId, status: "RETURNED", note: reason })}>Return for changes</button>
            <button className="btn btn-secondary" onClick={() => setReturning(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-brass" disabled={busy === curriculumId} onClick={() => send(curriculumId, "/api/dean/curricula", { curriculumId, status: "APPROVED", note: "" })}>Approve this curriculum</button>
          <button className="btn btn-secondary" onClick={() => setReturning(true)}>Return for changes…</button>
        </div>
      )}
    </div>
  );
}
