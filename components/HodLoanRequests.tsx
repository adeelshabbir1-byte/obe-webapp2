"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; kind: string; askedId: string | null; asked: string | null; course: string; from: string; note: string | null };
type Person = { id: string; name: string; role: string };

export default function HodLoanRequests({ items, people }: { items: Item[]; people: Person[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState<Record<string, string[]>>({}); // requestId -> allowed ids

  const eligible = (kind: string) => people.filter((p) => kind === "INSTRUCTOR" || p.role === "SUBJECT_EXPERT");
  const current = (i: Item) => ticked[i.id] ?? (i.askedId ? [i.askedId] : []);
  const toggle = (i: Item, id: string) => {
    const cur = current(i);
    setTicked((t) => ({ ...t, [i.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }));
  };

  async function decide(i: Item, decision: "APPROVE" | "REJECT") {
    let note = "";
    if (decision === "REJECT") {
      const n = window.prompt("Reason for declining (they will see this):");
      if (!n || !n.trim()) return;
      note = n;
    }
    setBusy(i.id); setError("");
    const res = await fetch("/api/hod/loans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanId: i.id, decision, note, allowedIds: current(i) }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Something went wrong"); return; }
    router.refresh();
  }

  return (
    <>
      {error && <div style={{ color: "#b3261e", marginBottom: 8 }}>{error}</div>}
      {items.length === 0 && <div style={{ color: "var(--slate)" }}>No requests waiting.</div>}
      {items.map((i) => (
        <div key={i.id} style={{ borderTop: "1px solid #eee", padding: "10px 0" }}>
          <div>
            <b>{i.course}</b> — {i.kind === "SUBJECT_EXPERT" ? "needs a Subject Expert" : "needs a teacher"}, asked by <b>{i.from}</b>.{" "}
            {i.asked ? <>They asked for <b>{i.asked}</b> specifically.</> : <>Any suitable person — you choose.</>}
            {i.note && <span style={{ color: "var(--slate)" }}> “{i.note}”</span>}
          </div>
          <div style={{ margin: "8px 0", display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            {eligible(i.kind).length === 0 && <span style={{ color: "var(--slate)" }}>You have no {i.kind === "SUBJECT_EXPERT" ? "Subject Experts" : "faculty"} to offer.</span>}
            {eligible(i.kind).map((p) => (
              <label key={p.id}><input type="checkbox" checked={current(i).includes(p.id)} onChange={() => toggle(i, p.id)} /> {p.name}</label>
            ))}
          </div>
          <button className="btn btn-brass" disabled={busy === i.id || current(i).length === 0} onClick={() => decide(i, "APPROVE")}>Allow ticked people</button>{" "}
          <button className="btn" disabled={busy === i.id} onClick={() => decide(i, "REJECT")}>Decline</button>
        </div>
      ))}
    </>
  );
}
