"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The teacher changes a value the template filled (a different date, a section …); every change is logged.
export default function PaperValueEditor({ paperId, fields }: { paperId: string; fields: { key: string; label: string; value: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState(Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} data-edit-values>Change the filled values</button>;
  return (
    <div className="card" style={{ padding: 10 }} data-values-form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {fields.map((f) => <label key={f.key} style={{ fontSize: 12 }}>{f.label}<br /><input value={vals[f.key] || ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} type={f.key === "date" ? "date" : "text"} data-value={f.key} /></label>)}
      </div>
      <button className="btn btn-sm" style={{ marginTop: 6 }} data-values-save onClick={async () => {
        setMsg(null);
        for (const f of fields) if ((vals[f.key] || "") !== (f.value || "")) {
          const r = await fetch("/api/paper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "value", paperId, field: f.key, value: vals[f.key] || "" }) });
          if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || "Failed."); return; }
        }
        setOpen(false); router.refresh();
      }}>Save (logged)</button>
      {msg && <div className="err">{msg}</div>}
    </div>
  );
}
