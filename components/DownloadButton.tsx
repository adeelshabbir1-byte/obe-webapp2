"use client";
import { useState } from "react";

// A plain <a href="/api/.../export"> link gives zero feedback the
// moment it's clicked — nothing visibly happens until the browser's
// own download indicator kicks in once the server actually starts
// responding, so a slow export (a large timetable, a big matrix)
// looks exactly like a dead button in the meantime. This fetches the
// file as a blob instead, showing a clear "Preparing…" state the whole
// time, then triggers the save itself once the response is in hand.
export default function DownloadButton({ url, label, className, style, method = "GET" }: {
  url: string; label: string; className?: string; style?: React.CSSProperties; method?: "GET" | "POST";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    setLoading(true); setError("");
    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        let message = "Something went wrong preparing the download.";
        try { const data = await res.json(); message = data.error || message; } catch { /* not JSON */ }
        setError(message); setLoading(false); return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "download";
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(blobUrl);
      setLoading(false);
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <span>
      <button type="button" onClick={handleDownload} disabled={loading} className={className || "btn"} style={style}>
        {loading ? "Preparing…" : label}
      </button>
      {error && <div className="err" style={{ marginTop: 6 }}>{error}</div>}
    </span>
  );
}
