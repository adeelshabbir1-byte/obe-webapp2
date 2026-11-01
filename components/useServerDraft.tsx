"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Autosave a form's unsaved state to the server every few seconds (Adeel prompt §19.2). On return the page offers
 * "Restore your unsaved draft?". Call clear() after a real save. `empty` says when there is nothing worth keeping.
 */
export function useServerDraft<T>(key: string, value: T, empty: (v: T) => boolean, restore: (v: T) => void) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ data: T; at: string } | null>(null);
  const last = useRef("");
  useEffect(() => {
    fetch(`/api/drafts?key=${encodeURIComponent(key)}`).then((r) => r.json()).then((d) => { if (d.draft && d.draft.data && !empty(d.draft.data)) setOffer(d.draft); }).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const t = setTimeout(() => {
      const s = JSON.stringify(value);
      if (s === last.current || empty(value)) return;
      last.current = s;
      fetch("/api/drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, data: value }) })
        .then((r) => r.ok && setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }))).catch(() => null);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(value)]);
  const clear = () => { last.current = ""; setSavedAt(null); setOffer(null); fetch(`/api/drafts?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null); };
  const banner = offer ? (
    <div role="status" style={{ background: "#FFF8E1", border: "1px solid #E0B54A", borderRadius: 8, padding: "6px 10px", margin: "6px 0", fontSize: 13 }}>
      You have an unsaved draft from {new Date(offer.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Restore it?{" "}
      <button type="button" className="btn btn-sm" onClick={() => { restore(offer.data); setOffer(null); }}>Restore</button>{" "}
      <button type="button" className="btn-link" onClick={clear}>Discard</button>
    </div>
  ) : null;
  const note = savedAt ? <span className="small-note" style={{ marginLeft: 8 }}>Draft saved {savedAt}</span> : null;
  return { banner, note, clear };
}
