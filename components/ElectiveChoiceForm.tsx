"use client";

import { useState } from "react";

type Option = { id: string; courseCode: string; courseTitle: string; description: string | null; capacity: number | null; seatsTaken: number; full: boolean };

export default function ElectiveChoiceForm({ groupId, initialOptions, registrationOpen }: {
  groupId: string; initialOptions: Option[]; registrationOpen: boolean;
}) {
  const [options, setOptions] = useState<Option[]>(initialOptions);
  const [rollNumber, setRollNumber] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ studentName: string; courseTitle: string; changed: boolean } | null>(null);

  async function submit() {
    if (!rollNumber.trim()) { setError("Enter your roll number first."); return; }
    if (!selectedOptionId) { setError("Choose one of the options above."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch(`/api/elective-choice/${groupId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber: rollNumber.trim(), optionId: selectedOptionId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setResult({ studentName: data.studentName, courseTitle: data.courseTitle, changed: data.changed });
      setOptions((prev) => prev.map((o) => o.id === selectedOptionId ? { ...o, seatsTaken: data.changed ? o.seatsTaken : o.seatsTaken + 1 } : o));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (!registrationOpen) {
    return <p style={{ fontSize: 14, color: "#46507A" }}>Registration for this elective isn't open right now — check with your Program Coordinator.</p>;
  }

  if (result) {
    return (
      <div>
        <p style={{ fontSize: 15, color: "#059669", fontWeight: 600, marginBottom: 6 }}>
          {result.changed ? "Your choice has been updated." : "Your choice has been recorded."}
        </p>
        <p style={{ fontSize: 13.5, color: "#46507A" }}>{result.studentName} — {result.courseTitle}</p>
        <button onClick={() => setResult(null)} className="act act-primary" style={{ marginTop: 14 }}>
          Change my choice
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <div style={{ background: "#FFE8ED", color: "#E11D48", padding: "8px 12px", fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: "#46507A", display: "block", marginBottom: 4 }}>Your Roll Number</label>
        <input
          value={rollNumber} onChange={(e) => setRollNumber(e.target.value)}
          placeholder="e.g. BSCS-F23-042" style={{ padding: "8px 10px", border: "1px solid #CDD6EA", fontSize: 14, width: "100%", maxWidth: 260 }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        {options.map((o) => (
          <label
            key={o.id}
            style={{
              display: "block", padding: "12px 14px", marginBottom: 8, cursor: o.full ? "not-allowed" : "pointer",
              border: selectedOptionId === o.id ? "2px solid #038666" : "1px solid #CDD6EA",
              background: o.full ? "#F3F6FD" : selectedOptionId === o.id ? "#EFF1FF" : "#fff", opacity: o.full ? 0.6 : 1,
            }}
          >
            <input
              type="radio" name="option" value={o.id} disabled={o.full}
              checked={selectedOptionId === o.id} onChange={() => setSelectedOptionId(o.id)}
              style={{ marginRight: 10 }}
            />
            <b style={{ fontSize: 14 }}>{o.courseCode} — {o.courseTitle}</b>
            {o.capacity !== null && (
              <span style={{ marginLeft: 8, fontSize: 11.5, color: o.full ? "#E11D48" : "#46507A" }}>
                {o.full ? "FULL" : `${o.capacity - o.seatsTaken} seat(s) left`}
              </span>
            )}
            {o.description && <div style={{ fontSize: 12, color: "#46507A", marginTop: 4, marginLeft: 26 }}>{o.description}</div>}
          </label>
        ))}
      </div>

      <button onClick={submit} disabled={loading} style={{ padding: "10px 24px", background: "#038666", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        {loading ? "Submitting…" : "Submit My Choice"}
      </button>
    </div>
  );
}
