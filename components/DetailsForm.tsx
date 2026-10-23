"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = { key: string; label: string; required?: boolean; hint?: string; kind?: string; options?: { value: string; label: string }[] };

/** A plain form over a list of AAS fields; saves to the given endpoint. */
/** `extra` is sent with the values (e.g. which record is being edited). */
export default function DetailsForm({ fields, values, endpoint, note, extra }: { fields: Field[]; values: Record<string, string>; endpoint: string; note?: string; extra?: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(values);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = fields.filter((f) => f.required && !(v[f.key] || "").trim()).length;
  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...v, ...(extra || {}) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false); setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: d.error || "Could not save" });
    if (r.ok) router.refresh();
  }
  return (
    <div>
      {note && <p className="small-note" style={{ marginTop: 0 }}>{note}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
        {fields.map((f) => (
          <label key={f.key} style={{ fontSize: 12 }}>{f.label}{f.required ? <span style={{ color: "#B3261E" }}> *</span> : null}<br />
            {f.options ? (
              // The NCEAC portal's own choices; a value saved earlier that is not one of them stays visible until changed.
              <select value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} style={{ width: "100%", padding: "5px 7px", border: `1px solid ${f.required && !(v[f.key] || "").trim() ? "#E8B4B0" : "var(--line)"}` }}>
                <option value="">—</option>
                {v[f.key] && !f.options.some((o) => o.value === v[f.key]) && <option value={v[f.key]}>{v[f.key]} (not a portal choice — please change)</option>}
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.kind === "yesno" ? <select value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} style={{ width: "100%", padding: "5px 7px" }}><option value="">—</option><option>Yes</option><option>No</option></select>
              : <input value={v[f.key] || ""} placeholder={f.hint || (f.kind === "date" ? "dd/mm/yyyy" : "")} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} style={{ width: "100%", padding: "5px 7px", border: `1px solid ${f.required && !(v[f.key] || "").trim() ? "#E8B4B0" : "var(--line)"}` }} />}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
        <button type="button" className="btn btn-brass" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <span style={{ fontSize: 12.5, color: missing ? "#B3261E" : "#2E7D4F" }}>{missing ? `${missing} required field(s) still empty` : "All required fields filled"}</span>
        {msg && <span style={{ fontSize: 12.5, color: msg.ok ? "#2E7D4F" : "#B3261E" }}>{msg.t}</span>}
      </div>
    </div>
  );
}
