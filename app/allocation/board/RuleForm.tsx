"use client";

import { useState } from "react";
import { post } from "../AllocForms";

export default function RuleForm({ teachers }: { teachers: { id: string; name: string }[] }) {
  const [k, setK] = useState("MUST"); const [t, setT] = useState(""); const [c, setC] = useState(""); const [n, setN] = useState(1); const [r, setR] = useState(""); const [m, setM] = useState("");
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>
      <select value={k} onChange={(e) => setK(e.target.value)}><option value="MUST">Must teach</option><option value="MUST_NOT">Must not teach</option><option value="MAX_NEW">Max new courses per term</option></select>
      {k !== "MAX_NEW" ? <><select value={t} onChange={(e) => setT(e.target.value)}><option value="">Teacher…</option>{teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><input value={c} onChange={(e) => setC(e.target.value.toUpperCase())} placeholder="Course code" style={{ width: 90 }} /></> : <input type="number" min={0} max={5} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: 50 }} />}
      <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Reason" style={{ width: 160 }} />
      <button type="button" className="btn btn-sm" onClick={async () => { const x = await post({ action: "rule", kind: k, facultyId: t, courseCode: c, n, reason: r }); setM(x.error || "Added ✓"); if (!x.error) setTimeout(() => location.reload(), 500); }}>Add rule</button> {m}
    </span>
  );
}
