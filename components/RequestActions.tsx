"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RequestActions({ id, mode, status }: { id: string; mode: "to" | "from"; status: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  async function go(action: string) {
    setMsg("");
    const res = await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, response: text }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) router.refresh(); else setMsg(d.error || "Something went wrong");
  }
  if (mode === "to") {
    if (status === "DONE" || status === "CLOSED") return null;
    return (
      <div style={{ marginTop: 6 }}>
        <textarea placeholder="Your reply (what you did, or why not yet)" value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", minHeight: 56, padding: 6, border: "1px solid var(--line)" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
          <button className="btn" onClick={() => go("RESPOND")}>Send reply</button>
          <button className="btn btn-brass" onClick={() => go("DONE")}>Mark as done</button>
          <span style={{ fontSize: 12.5, color: "#b3261e" }}>{msg}</span>
        </div>
      </div>
    );
  }
  if (status === "CLOSED") return null;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      {status !== "DONE" && <button className="btn" onClick={() => go("REMIND")}>{status === "RESPONDED" ? "Not enough, ask again" : "Remind"}</button>}
      <button className="btn" onClick={() => go("CLOSE")}>{status === "DONE" || status === "RESPONDED" ? "Accept and close" : "Withdraw"}</button>
      <span style={{ fontSize: 12.5, color: "#b3261e" }}>{msg}</span>
    </div>
  );
}
