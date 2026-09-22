"use client";

import { useState } from "react";

type Question = { id: string; text: string };

export default function SurveyResponseForm({ token, questions }: { token: string; questions: Question[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (Object.keys(answers).length < questions.length) { setError("Please answer every question before submitting."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/survey/${token}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setSubmitted(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (submitted) {
    return <p style={{ fontSize: 14, color: "#2E8B7A" }}>Thank you — your response has been recorded.</p>;
  }

  return (
    <div>
      {error && <div style={{ background: "#FBE2DF", color: "#C0312B", padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13.5, marginBottom: 8 }}>{i + 1}. {q.text}</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                style={{
                  width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
                  border: answers[q.id] === v ? "2px solid #5A1923" : "1px solid #D4D0C4",
                  background: answers[q.id] === v ? "#5A1923" : "#fff",
                  color: answers[q.id] === v ? "#fff" : "#241A1D", fontWeight: 600, fontSize: 14,
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button onClick={submit} disabled={loading} style={{ padding: "10px 24px", background: "#B08D57", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        {loading ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
