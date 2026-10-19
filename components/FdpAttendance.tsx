"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Tick who attended an FDP session; saving marks it held and issues certificates. */
export default function FdpAttendance({ sessionId, people, attended }: { sessionId: string; people: [string, string][]; attended: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(new Set(attended));
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Attendance ({attended.length})</button>;
  return (
    <div style={{ border: "1px solid var(--line, #ddd)", borderRadius: 6, padding: 8, marginTop: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 4, maxHeight: 260, overflowY: "auto" }}>
        {people.map(([id, n]) => <label key={id} style={{ fontSize: 12.5 }}><input type="checkbox" checked={sel.has(id)} onChange={() => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); }} /> {n}</label>)}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/fdp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attendance", sessionId, userIds: Array.from(sel) }) });
          setBusy(false);
          if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || "Could not save."); return; }
          setOpen(false); router.refresh();
        }}>{busy ? "Saving…" : `Save ${sel.size} attended`}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>
    </div>
  );
}
