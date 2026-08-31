"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubmitTemplateButton({ courseId, disabled }: { courseId: string; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/subjectexpert/courses/${courseId}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      <button onClick={onClick} disabled={disabled || loading} className="btn" style={{ background: "var(--sage)", borderColor: "var(--sage)", color: "#fff" }}>
        {loading ? "Submitting…" : "Submit for OMC Review"}
      </button>
    </div>
  );
}
