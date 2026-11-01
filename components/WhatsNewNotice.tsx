"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Entry = { id: string; date: string; text: string; href?: string };
// The first time a person opens the app after a deploy: what changed for their role. Dismissed per person.
export default function WhatsNewNotice() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("whatsnew-checked") === "1"; } catch { /* private window */ }
    if (seen) return;
    fetch("/api/whats-new").then((r) => r.json()).then((d) => { setEntries(d.entries || []); try { sessionStorage.setItem("whatsnew-checked", "1"); } catch { /* ignore */ } }).catch(() => null);
  }, []);
  if (!entries.length) return null;
  const dismiss = () => { setEntries([]); fetch("/api/whats-new", { method: "POST" }).catch(() => null); };
  return (
    <div className="card no-print" role="status" style={{ marginBottom: 12, borderLeft: "4px solid #1B5FAA" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b style={{ fontSize: 14 }}>What&apos;s new for you</b>
        <span><Link href="/whats-new" className="small-note">All updates</Link> · <button type="button" className="btn-link" onClick={dismiss}>Got it</button></span>
      </div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
        {entries.map((e) => <li key={e.id}>{e.href ? <Link href={e.href}>{e.text}</Link> : e.text}</li>)}
      </ul>
    </div>
  );
}
