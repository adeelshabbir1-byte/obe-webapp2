"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = { name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea"; options?: [string, string][]; width?: number; placeholder?: string; required?: boolean };

/** A form with ordinary fields and one file, sent as multipart to `url`. */
export default function UploadForm({ url, fields, file, submit, fixed = {}, collapsed, openLabel, initial = {} }: { url: string; fields: Field[]; file?: { name: string; label: string; accept?: string }; submit: string; fixed?: Record<string, string>; collapsed?: boolean; openLabel?: string; initial?: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsed);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    for (const [k, v] of Object.entries(fixed)) fd.set(k, v);
    setBusy(true); setMsg(null);
    const r = await fetch(url, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: "Saved." }); formEl.reset(); router.refresh(); if (collapsed) setOpen(false); } else setMsg({ ok: false, t: d.error || "Could not save" });
  }
  if (!open) return <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>{openLabel || submit}</button>;
  return (
    <form onSubmit={go} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      {fields.map((f) => (
        <label key={f.name} style={{ fontSize: 12, flex: f.type === "textarea" ? "1 1 100%" : undefined }}>{f.label}{f.required ? " *" : ""}<br />
          {f.type === "select" ? <select name={f.name} defaultValue={initial[f.name] || ""} style={{ width: f.width || 180 }}><option value="">—</option>{(f.options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : f.type === "textarea" ? <textarea name={f.name} defaultValue={initial[f.name] || ""} rows={3} style={{ width: "100%", fontFamily: "inherit" }} placeholder={f.placeholder} />
              : <input name={f.name} type={f.type || "text"} step={f.type === "number" ? "any" : undefined} defaultValue={initial[f.name] || ""} placeholder={f.placeholder} style={{ width: f.width || 180 }} required={f.required} />}
        </label>
      ))}
      {file && <label style={{ fontSize: 12 }}>{file.label}<br /><input name={file.name} type="file" accept={file.accept} style={{ maxWidth: 240 }} /></label>}
      <button className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Saving…" : submit}</button>
      {collapsed && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>}
      {msg && <span style={{ fontSize: 12.5, color: msg.ok ? "#1E6B3A" : "#B3261E" }}>{msg.t}</span>}
    </form>
  );
}
