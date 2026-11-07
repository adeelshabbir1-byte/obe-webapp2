"use client";
import { useState } from "react";

// Item 23 (speed): the home page's figures are kept for 10 minutes; this works them out again now.
export default function HomeRefresh({ at }: { at: string }) {
  const [busy, setBusy] = useState(false);
  const t = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
  return <span className="small-note no-print">figures from {t} · <button type="button" className="btn-link" disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/home-refresh", { method: "POST" }).catch(() => null); location.reload(); }}>{busy ? "working out…" : "Refresh now"}</button></span>;
}
