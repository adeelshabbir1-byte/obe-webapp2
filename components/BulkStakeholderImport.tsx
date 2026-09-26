"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import DownloadButton from "./DownloadButton";

export default function BulkStakeholderImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ alumniCreated: number; employersCreated: number; employmentCreated: number; degreesCreated: number; errors: string[] } | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a filled-in template file first."); return; }
    setUploading(true); setError(""); setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/coordinator/stakeholders/upload-bulk", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setUploading(false); return; }
      setSummary(data); setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setUploading(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Bulk Import from Excel</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Download the template, fill it in offline (Alumni, Employers, Employment, and Degrees sheets), then upload
        it back. Everything goes through the same review queue as manual entries.
      </p>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: summary ? 14 : 0 }}>
        <DownloadButton url="/api/coordinator/stakeholders/download-template" label="Download Template" className="btn btn-brass" />
        <input ref={fileRef} type="file" accept=".xlsx" style={{ fontSize: 12 }} />
        <button onClick={upload} disabled={uploading} className="btn btn-brass">{uploading ? "Uploading…" : "Upload Filled Template"}</button>
      </div>
      {summary && (
        <div style={{ fontSize: 12.5 }}>
          <p style={{ color: "var(--sage)", marginBottom: 6 }}>
            Created: {summary.alumniCreated} alumni, {summary.employersCreated} employer(s), {summary.employmentCreated} employment record(s), {summary.degreesCreated} degree(s) — all pending review.
          </p>
          {summary.errors.length > 0 && (
            <div style={{ color: "var(--rust)" }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>{summary.errors.length} row(s) had issues:</p>
              {summary.errors.map((e, i) => <p key={i} style={{ fontSize: 11.5 }}>{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
