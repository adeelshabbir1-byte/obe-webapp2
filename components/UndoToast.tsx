"use client";

import { useEffect, useRef, useState } from "react";

// "Done · Undo" for 10 seconds after a save, move, delete or merge (Adeel prompt §2). Any API reply that carries
// { undoToken, undoLabel } shows it — the routes opt in (lib/undo.ts offerUndo); pages need no change.
export default function UndoToast() {
  const [t, setT] = useState<{ token: string; label: string; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const w = window as unknown as { __undoPatched?: boolean; fetch: typeof fetch };
    if (w.__undoPatched) return;
    w.__undoPatched = true;
    const orig = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await orig(...args);
      try {
        if ((res.headers.get("content-type") || "").includes("application/json") && !String(args[0]).includes("/api/undo")) {
          res.clone().json().then((d: { undoToken?: string; undoLabel?: string }) => {
            if (d && d.undoToken) window.dispatchEvent(new CustomEvent("obehub:undo", { detail: { token: d.undoToken, label: d.undoLabel || "Done" } }));
          }).catch(() => null);
        }
      } catch { /* ignore */ }
      return res;
    };
  }, []);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ token: string; label: string }>).detail;
      setT({ token: d.token, label: d.label, left: 10 });
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => setT((x) => (x && x.left > 1 ? { ...x, left: x.left - 1 } : null)), 1000);
    };
    window.addEventListener("obehub:undo", on);
    return () => window.removeEventListener("obehub:undo", on);
  }, []);
  if (!t) return null;
  async function undo() {
    const tok = t!.token;
    setT(null);
    const r = await fetch("/api/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tok }) }).then((x) => x.json()).catch(() => ({ error: "Could not undo." }));
    if (r.error) alert(r.error); else location.reload();
  }
  return (
    <div role="status" className="no-print" style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#1F2937", color: "#fff", borderRadius: 10, padding: "8px 14px", zIndex: 1000, display: "flex", gap: 12, alignItems: "center", fontSize: 13.5, boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}>
      <span>{t.label}</span>
      <button type="button" onClick={undo} style={{ background: "none", border: "none", color: "#93C5FD", fontWeight: 700, cursor: "pointer" }}>Undo ({t.left})</button>
    </div>
  );
}
