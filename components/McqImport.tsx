"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function McqImport({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  async function onFile(f: File | undefined) {
    if (!f) return; setMsg("Importing…");
    const r = await fetch("/api/mcq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, action: "import", csv: await f.text() }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Added ${d.added} questions.${d.errors?.length ? ` Skipped: ${d.errors.join(" ")}` : ""}` : d.error || "Import failed."); if (r.ok) router.refresh();
  }
  return <span style={{ fontSize: 13 }}><label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} /></label> <a href="/api/mcq/template" className="act">Template</a> {msg}</span>;
}
