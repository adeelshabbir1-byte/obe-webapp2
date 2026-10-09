"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Incoming } from "../lib/courseSplit";

export default function IncomingRequests({ items, title }: { items: Incoming[]; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(body: Record<string, string>) {
    setBusy(true); setMsg("");
    const res = await fetch("/api/course-split", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not save"); return; }
    if (body.action === "ACCEPT_ALL") setMsg(`${j.count} accepted.`);
    router.refresh();
  }
  if (items.length === 0) return <div className="card"><p style={{ fontSize: 13, margin: 0 }}>No course requests are waiting for you.</p></div>;
  return (
    <div className="card" style={{ marginBottom: 14, borderColor: "var(--brass-dark)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 14, margin: 0, flex: 1 }}>{title}</h3>
        <button className="btn btn-brass" disabled={busy} onClick={() => send({ action: "ACCEPT_ALL" })}>Accept all ({items.length})</button>
        {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>
      {items.map((i) => (
        <div key={i.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--line)", marginTop: 8 }}>
          <span style={{ fontSize: 13, flex: 1 }}><strong>{i.code}</strong> {i.title} from {i.fromDepartment}, to be handled by {i.ownerName}</span>
          <button className="btn btn-brass" disabled={busy} onClick={() => send({ id: i.id, action: "ACCEPT" })}>Accept</button>
          <button className="btn" disabled={busy} onClick={() => send({ id: i.id, action: "DECLINE" })}>Decline</button>
        </div>
      ))}
    </div>
  );
}
