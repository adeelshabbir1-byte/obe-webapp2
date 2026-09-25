"use client";

import { useState } from "react";
import Link from "next/link";
import SortableTable from "./SortableTable";

type Course = { id: string; code: string; title: string; subjectExpertName: string | null; templateStatus: string; assignedOmcReviewerId: string | null; assignedOmcReviewerName: string | null };
type OmcMember = { id: string; name: string };

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    submitted: ["#E8E6FB", "#8A6B2E"], approved: ["#CCFBF1", "#4B7A63"], "changes-requested": ["#FFE8ED", "#EA580C"],
  };
  const [bg, fg] = map[status] || ["#EEF2FA", "#46507A"];
  return <span style={{ background: bg, color: fg, fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{status.replace("-", " ")}</span>;
}

export default function OmcReviewQueue({ myId, courses: initialCourses, omcMembers }: { myId: string; courses: Course[]; omcMembers: OmcMember[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balancing, setBalancing] = useState(false);
  const [error, setError] = useState("");
  const [showOthers, setShowOthers] = useState(false);

  async function assign(courseId: string, reviewerId: string) {
    setBusyId(courseId); setError("");
    try {
      const res = await fetch(`/api/omc/courses/${courseId}/assign-reviewer`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerId: reviewerId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      const reviewer = omcMembers.find((m) => m.id === reviewerId);
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, assignedOmcReviewerId: reviewerId || null, assignedOmcReviewerName: reviewer?.name || null } : c));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function autoBalance() {
    if (!confirm("Round-robin every currently unassigned course evenly across all OMC members?")) return;
    setBalancing(true); setError("");
    try {
      const res = await fetch("/api/omc/auto-balance-reviews", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBalancing(false); return; }
      window.location.reload(); // simplest way to reflect the full redistribution correctly
    } catch (err: any) { setError("Unexpected error: " + err.message); setBalancing(false); }
  }

  const mine = courses.filter((c) => c.assignedOmcReviewerId === myId);
  const unassigned = courses.filter((c) => !c.assignedOmcReviewerId);
  const others = courses.filter((c) => c.assignedOmcReviewerId && c.assignedOmcReviewerId !== myId);

  function Row({ c }: { c: Course }) {
    return (
      <tr key={c.id}>
        <td>{c.code}</td><td>{c.title}</td><td>{c.subjectExpertName || "—"}</td>
        <td>{statusBadge(c.templateStatus)}</td>
        <td>
          <select
            value={c.assignedOmcReviewerId || ""} disabled={busyId === c.id}
            onChange={(e) => assign(c.id, e.target.value)}
            style={{ fontSize: 11.5, padding: "2px 4px", border: "1px solid var(--line)" }}
          >
            <option value="">Unassigned</option>
            {omcMembers.map((m) => <option key={m.id} value={m.id}>{m.id === myId ? "Me" : m.name}</option>)}
          </select>
        </td>
        <td><Link href={`/omc/templates/${c.id}`} className="act act-primary">Review</Link></td>
      </tr>
    );
  }

  return (
    <>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 11.5, color: "var(--slate)" }}>
          Anyone on OMC can review, comment on, or approve any course — this assignment is just for splitting
          up the workload so the queue doesn't fall to whoever happens to click first.
        </p>
        <button onClick={autoBalance} disabled={balancing || unassigned.length === 0} className="btn btn-ai" style={{ fontSize: 12, whiteSpace: "nowrap", marginLeft: 12 }}>
          {balancing ? "Balancing…" : `Auto-Balance ${unassigned.length} Unassigned`}
        </button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Assigned to Me ({mine.length})</h3>
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Subject Expert</th><th>Status</th><th>Assigned To</th><th></th></tr></thead>
          <tbody>
            {mine.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>Nothing assigned to you right now.</td></tr>}
            {mine.map((c) => <Row key={c.id} c={c} />)}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Unassigned ({unassigned.length})</h3>
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Subject Expert</th><th>Status</th><th>Assigned To</th><th></th></tr></thead>
          <tbody>
            {unassigned.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>Nothing waiting to be picked up.</td></tr>}
            {unassigned.map((c) => <Row key={c.id} c={c} />)}
          </tbody>
        </SortableTable>
      </div>

      <div className="card">
        <button onClick={() => setShowOthers((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
          {showOthers ? "▾" : "▸"} Assigned to Other OMC Members ({others.length})
        </button>
        {showOthers && (
          <div style={{ marginTop: 12 }}>
            <SortableTable>
              <thead><tr><th>Code</th><th>Title</th><th>Subject Expert</th><th>Status</th><th>Assigned To</th><th></th></tr></thead>
              <tbody>
                {others.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>None.</td></tr>}
                {others.map((c) => <Row key={c.id} c={c} />)}
              </tbody>
            </SortableTable>
          </div>
        )}
      </div>
    </>
  );
}
