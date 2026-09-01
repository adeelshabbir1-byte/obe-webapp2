"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Req = {
  id: string; courseCode: string; courseTitle: string; subjectExpertName: string;
  assignmentPct: number; quizPct: number; projectPct: number; labPct: number; midtermPct: number; finalPct: number;
};

export default function WeightExceptionsManager({ initialRequests }: { initialRequests: Req[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function decide(requestId: string, status: "approved" | "rejected") {
    setLoading(true); setError("");
    const commentEl = document.getElementById(`comment-${requestId}`) as HTMLTextAreaElement;
    try {
      const res = await fetch(`/api/omc/weight-exceptions/${requestId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: commentEl?.value || "" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOpenId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Course</th><th>Subject Expert</th><th>Proposed Weights</th><th></th></tr></thead>
          <tbody>
            {initialRequests.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No pending weight exception requests.</td></tr>}
            {initialRequests.map((r) => (
              <tr key={r.id}>
                <td><b>{r.courseCode}</b><br /><span style={{ color: "var(--slate)", fontSize: 11.5 }}>{r.courseTitle}</span></td>
                <td>{r.subjectExpertName}</td>
                <td style={{ fontSize: 11.5 }}>
                  A {r.assignmentPct}% · Q {r.quizPct}% · P {r.projectPct}% · L {r.labPct}% · Mid {r.midtermPct}% · Final {r.finalPct}%
                </td>
                <td>
                  <button onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                    {openId === r.id ? "Close" : "Review"}
                  </button>
                  {openId === r.id && (
                    <div style={{ marginTop: 10 }}>
                      <textarea id={`comment-${r.id}`} rows={2} placeholder="Comment for the Subject Expert (optional)..." style={{ width: 220, padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12, marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => decide(r.id, "approved")} disabled={loading} className="btn" style={{ background: "var(--sage)", borderColor: "var(--sage)", color: "#fff", padding: "5px 10px", fontSize: 11.5 }}>Approve</button>
                        <button onClick={() => decide(r.id, "rejected")} disabled={loading} className="btn" style={{ background: "var(--rust)", borderColor: "var(--rust)", color: "#fff", padding: "5px 10px", fontSize: 11.5 }}>Reject</button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
