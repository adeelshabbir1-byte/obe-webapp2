"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LocalSolutionUploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose the solution.xlsx file the desktop tool produced."); return; }
    setUploading(true); setError(""); setOk(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/coordinator/timetable/upload-solution", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setUploading(false); return; }
      setOk(true); setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setUploading(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: "var(--slate)" }}>2.</span>
      <input ref={fileRef} type="file" accept=".xlsx" style={{ fontSize: 12 }} />
      <button onClick={upload} disabled={uploading} className="btn btn-brass">{uploading ? "Uploading…" : "Upload Solution"}</button>
      {ok && <span style={{ color: "var(--sage)", fontSize: 12 }}>✓ Loaded</span>}
      {error && <span style={{ color: "var(--rust)", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
