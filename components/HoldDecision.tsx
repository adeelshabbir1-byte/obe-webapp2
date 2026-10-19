"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type C = { id: string; code: string; title: string; creditHours: number; courseType: string; note?: string };

/** The advisor ticks the courses a held student takes this term. */
export default function HoldDecision({ holdId, own, repeats, maxCredits }: { holdId: string; own: C[]; repeats: C[]; maxCredits: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(repeats.map((r) => r.id)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const all = [...repeats, ...own];
  const ch = all.filter((c) => sel.has(c.id)).reduce((a, c) => a + c.creditHours, 0);
  const flip = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  return (
    <div>
      {all.map((c) => (
        <label key={c.id} style={{ display: "block", fontSize: 13, padding: "2px 0" }}>
          <input type="checkbox" checked={sel.has(c.id)} onChange={() => flip(c.id)} /> <b>{c.code}</b> {c.title} <span className="small-note">· {c.creditHours} CH · {c.courseType}{c.note ? ` · ${c.note}` : ""}</span>
        </label>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <span style={{ fontWeight: 700, color: ch > maxCredits ? "#C62828" : "#1E7B45" }}>{ch} CH chosen (limit {maxCredits} at low CGPA)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record (optional)" style={{ minWidth: 240 }} />
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={async () => {
          if (ch > maxCredits && !confirm(`That is more than ${maxCredits} credit hours. Register anyway?`)) return;
          setBusy(true);
          const r = await fetch("/api/registration-holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdId, courseIds: Array.from(sel), note }) });
          setBusy(false);
          if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || "Could not save."); return; }
          router.refresh();
        }}>{busy ? "Registering…" : "Register these courses"}</button>
      </div>
    </div>
  );
}
