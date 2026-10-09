"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Crit = { degreeProgram: string; academicYear: string; minPercentage: string; requiredSubjects: string; entryTest: string; minTestScore: string; seats: string; transferPolicy: string; otherConditions: string };

function Row({ scopeKey, c, canEdit }: { scopeKey: string; c: Crit; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(c);
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const set = (k: keyof Crit) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const input = { padding: "6px 8px", border: "1px solid var(--line)", width: "100%" } as const;
  async function save() {
    setMsg("");
    const res = await fetch("/api/admission-criteria", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...v, scopeKey }) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  const set_ = !!(v.minPercentage || v.requiredSubjects || v.entryTest || v.seats);
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>{c.degreeProgram}</h3>
        <span style={{ fontSize: 12, color: set_ ? "var(--sage)" : "#96650F" }}>{set_ ? "Criteria set" : "Not set yet"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
        <label style={{ fontSize: 12 }}>Intake year<input style={input} disabled={!canEdit} value={v.academicYear} placeholder="e.g. 2026" onChange={set("academicYear")} /></label>
        <label style={{ fontSize: 12 }}>Minimum marks in Intermediate / HSSC (%)<input style={input} disabled={!canEdit} type="number" min={50} max={100} value={v.minPercentage} onChange={set("minPercentage")} /></label>
        <label style={{ fontSize: 12 }}>Seats per year<input style={input} disabled={!canEdit} type="number" min={0} value={v.seats} onChange={set("seats")} /></label>
        <label style={{ fontSize: 12 }}>Entry test<input style={input} disabled={!canEdit} value={v.entryTest} placeholder="e.g. NTS NAT-IE, ECAT, university test" onChange={set("entryTest")} /></label>
        <label style={{ fontSize: 12 }}>Minimum test score (%)<input style={input} disabled={!canEdit} type="number" min={0} max={100} value={v.minTestScore} onChange={set("minTestScore")} /></label>
      </div>
      <label style={{ fontSize: 12, display: "block", marginTop: 10 }}>Required subjects<textarea style={{ ...input, minHeight: 50 }} disabled={!canEdit} value={v.requiredSubjects} placeholder="e.g. Mathematics at Intermediate level, or a deficiency course in the first year" onChange={set("requiredSubjects")} /></label>
      <label style={{ fontSize: 12, display: "block", marginTop: 10 }}>Transfer-credit policy<textarea style={{ ...input, minHeight: 50 }} disabled={!canEdit} value={v.transferPolicy} onChange={set("transferPolicy")} /></label>
      <label style={{ fontSize: 12, display: "block", marginTop: 10 }}>Other conditions<textarea style={{ ...input, minHeight: 50 }} disabled={!canEdit} value={v.otherConditions} placeholder="Age limit, reserved seats, documents needed, interview..." onChange={set("otherConditions")} /></label>
      {canEdit && <div style={{ marginTop: 10 }}><button className="btn" onClick={save}>Save</button> <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e", marginLeft: 8 }}>{msg}</span></div>}
    </div>
  );
}

export default function AdmissionCriteriaManager({ scopeKey, rows, canEdit }: { scopeKey: string; rows: Crit[]; canEdit: boolean }) {
  return <>{rows.map((c) => <Row key={`${scopeKey}|${c.degreeProgram}`} scopeKey={scopeKey} c={c} canEdit={canEdit} />)}</>;
}
