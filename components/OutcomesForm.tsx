"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = { padding: "6px 8px", border: "1px solid var(--line)", width: 110 } as const;

export default function OutcomesForm({ mode, kinds }: { mode: "FIGURES" | "SURVEY"; kinds?: Record<string, string> }) {
  const router = useRouter();
  const [f, setF] = useState<Record<string, string>>({ kind: "STUDENT" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const res = await fetch("/api/outcomes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, type: mode }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) { setF({ kind: f.kind }); router.refresh(); }
  }
  const field = (k: string, label: string, type = "number") => <label style={{ fontSize: 12 }}>{label}<br /><input style={input} type={type} value={f[k] || ""} onChange={set(k)} /></label>;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>{mode === "FIGURES" ? "Add or update a year's figures" : "Record a survey"}</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        {mode === "FIGURES" ? <>
          {field("intakeYear", "Intake year")}{field("admitted", "Admitted")}{field("graduated", "Graduated")}{field("graduatedOnTime", "On time (4 years)")}{field("droppedOut", "Dropped out")}{field("employedOrStudying", "Employed or studying")}
        </> : <>
          <label style={{ fontSize: 12 }}>Survey<br /><select style={{ ...input, width: 150 }} value={f.kind} onChange={set("kind")}>{Object.entries(kinds || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {field("surveyDate", "Date held", "date")}{field("respondents", "Responded")}{field("invited", "Invited")}{field("avgRating", "Average (out of 5)")}
        </>}
      </div>
      {mode === "SURVEY" ? (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <textarea style={{ ...input, width: "100%", minHeight: 50 }} placeholder="What the survey found" value={f.findings || ""} onChange={set("findings")} />
          <textarea style={{ ...input, width: "100%", minHeight: 50 }} placeholder="Action taken as a result" value={f.actionTaken || ""} onChange={set("actionTaken")} />
        </div>
      ) : <input style={{ ...input, width: "100%", marginTop: 8 }} placeholder="Note (optional)" value={f.notes || ""} onChange={set("notes")} />}
      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-brass" onClick={save}>Save</button><span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
    </div>
  );
}
