"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FixScript({ sql }: { sql: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn" onClick={copy}>{copied ? "Copied ✓" : "Copy script"}</button>
        <a className="btn btn-secondary" href="/api/admin/system-health">Download .sql</a>
        <button className="btn btn-secondary" onClick={() => router.refresh()}>Check again</button>
      </div>
      <textarea readOnly value={sql} rows={Math.min(24, sql.split("\n").length + 1)} style={{ width: "100%", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12, whiteSpace: "pre" }} />
    </div>
  );
}

export function CheckAgain() {
  const router = useRouter();
  return <button className="btn btn-secondary" onClick={() => router.refresh()}>Check again</button>;
}
