"use client";

import { useState } from "react";

export default function RemindButton({ deadlineId, toId, item }: { deadlineId: string; toId: string; item: string }) {
  const [s, setS] = useState("");
  async function go() {
    const res = await fetch("/api/semester-plan/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deadlineId, toId, item }) });
    const d = await res.json().catch(() => ({}));
    setS(res.ok ? "Reminder sent" : d.error || "Could not send");
  }
  return <span style={{ marginLeft: 8 }}>{s ? <span style={{ fontSize: 11.5, color: s === "Reminder sent" ? "var(--sage)" : "#b3261e" }}>{s}</span> : <button className="btn" style={{ fontSize: 11.5, padding: "1px 8px" }} onClick={go}>Remind</button>}</span>;
}
