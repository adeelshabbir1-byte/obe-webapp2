"use client";

import { useState } from "react";

export default function SubmitTemplateButton({ courseId, disabled }: { courseId: string; disabled: boolean }) {
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setSubmitted(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      <button onClick={onClick} disabled={disabled || loading || submitted} className="btn btn-approve" style={{ background: "var(--sage)", borderColor: "var(--sage)", color: "#fff" }}>
        {loading ? "Submitting…" : submitted ? "Submitted" : "Submit for OMC Review"}
      </button>
    </div>
  );
}
