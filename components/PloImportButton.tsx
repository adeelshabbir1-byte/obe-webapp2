"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload PLOs from Excel/CSV (# , Title, Description). Existing numbers are kept; only new ones are added.
export default function PloImportButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(file: File) {
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.append("file", file); fd.append("batchId", batchId);
    try {
      const res = await fetch("/api/coordinator/plos/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "Import failed.");
      else { setMsg(`${d.added} PLO(s) added, ${d.skipped} already existed.${d.errors?.length ? " " + d.errors.join("; ") : ""}`); router.refresh(); }
    } catch { setMsg("Import failed."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <span>
      <button className="btn btn-brass" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Importing…" : "Import from Excel"}</button>
      <input ref={input} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {msg && <span style={{ fontSize: 12.5, color: "var(--slate)", marginLeft: 10 }}>{msg}</span>}
    </span>
  );
}
