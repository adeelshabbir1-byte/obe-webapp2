"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PassOnForm({ parentId, parentDate, suggested, current }: { parentId: string; parentDate: string; suggested: string; current: string }) {
  const router = useRouter();
  const [d, setD] = useState(current || suggested);
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  async function go() {
    const res = await fetch("/api/semester-plan/pass", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId, dueDate: d }) });
    const j = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Passed on." : j.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  const slack = d ? Math.round((new Date(parentDate).getTime() - new Date(d).getTime()) / 86400000) : 0;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="date" value={d} max={parentDate} onChange={(e) => setD(e.target.value)} style={{ padding: "4px 6px", border: "1px solid var(--line)" }} />
      <span style={{ fontSize: 11.5, color: slack >= 7 ? "var(--slate)" : "#B7791F" }}>{slack} days of slack</span>
      <button className="btn" onClick={go}>{current ? "Change" : "Pass on"}</button>
      <span style={{ fontSize: 12, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
    </span>
  );
}
