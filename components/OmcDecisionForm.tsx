"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OmcDecisionForm({ courseId, currentComment }: { courseId: string; currentComment: string | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function decide(status: "approved" | "changes-requested") {
    setLoading(true); setError("");
    const commentEl = document.getElementById("omc-comment") as HTMLTextAreaElement;
    try {
      const res = await fetch(`/api/omc/templates/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: commentEl?.value || "" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.push("/omc/queue"); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Decision</h3>
      {error && <div className="err">{error}</div>}
      <div className="field"><label>Comment (visible to the Subject Expert)</label><textarea id="omc-comment" defaultValue={currentComment || ""} rows={3} style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--line)" }} /></div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => decide("approved")} disabled={loading} className="btn" style={{ background: "var(--sage)", borderColor: "var(--sage)", color: "#fff" }}>Approve</button>
        <button onClick={() => decide("changes-requested")} disabled={loading} className="btn" style={{ background: "var(--rust)", borderColor: "var(--rust)", color: "#fff" }}>Request Changes</button>
      </div>
    </div>
  );
}
