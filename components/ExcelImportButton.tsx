"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Generic "Import from Excel" button: posts the chosen file (plus any extra fields) to an import route and shows its summary.
export default function ExcelImportButton({ endpoint, label = "Import from Excel", fields = {} }: { endpoint: string; label?: string; fields?: Record<string, string> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(true);

  async function upload(file: File) {
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.append("file", file);
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      setOk(res.ok);
      setMsg(res.ok ? `${d.message || "Imported."}${d.warnings?.length ? " " + d.warnings.join("; ") : ""}` : d.error || "Import failed.");
      if (res.ok) router.refresh();
    } catch { setOk(false); setMsg("Import failed."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <span>
      <button className="btn btn-brass" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Importing…" : label}</button>
      <input ref={input} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {msg && <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e", marginLeft: 10 }}>{msg}</span>}
    </span>
  );
}
