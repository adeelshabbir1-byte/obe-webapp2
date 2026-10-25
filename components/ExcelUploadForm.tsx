"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A small "upload an Excel file" form that shows the server's message.
export default function ExcelUploadForm({ url, label, help }: { url: string; label: string; help?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      const r = await fetch(url, { method: "POST", body: new FormData(e.currentTarget) });
      const d = await r.json().catch(() => ({}));
      setMsg({ ok: r.ok, text: d.message || d.error || (r.ok ? "Done." : "Upload failed.") }); setBusy(false);
      if (r.ok) router.refresh();
    }} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="file" name="file" accept=".xlsx" required aria-label={label} />
      <button className="btn btn-sm" type="submit" disabled={busy}>{busy ? "Uploading…" : label}</button>
      {help && <span className="small-note" style={{ margin: 0 }}>{help}</span>}
      {msg && <span className={msg.ok ? "small-note" : "err"} style={{ margin: 0, color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</span>}
    </form>
  );
}
